import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  DEFAULT_LLM, QuerySchema, ScalarSchema, SpecSchema, collectionProblems, modelInfo, nodeQueries, outputName, routeParams, specJsonSchema, validateSpecTree, withCollections,
  usageCost, type AppScope, type DbSchema, type GenerateProgress, type GenerateUsage, type LlmOptions, type Query, type Scalar, type Spec,
} from "@sibilla/shared";
import { checkQuery } from "./query";
import { customProblems } from "./custom";
import type { LibraryStore } from "./libraries";
import type { SeedItem } from "./records";

export type Attachment = { name: string; mediaType: string; data: string };
export type GenerateInput = {
  prompt: string;
  currentSpec: Spec | null;
  history: { role: "user" | "assistant"; content: string }[];
  attachments: Attachment[];
  /** Model, effort and whether to show the reasoning; defaults apply when absent. */
  llm?: LlmOptions;
  /** "procedural": build one screen at a time; what its links lead to is generated when the user gets there. */
  mode?: "classic" | "procedural";
  /** The user followed a link to a screen that doesn't exist yet: generate that screen. `currentSpec` is the screen they came from. */
  navigate?: Navigation;
};
export type Navigation = {
  from: string; to: string; label: string; intent: string;
  params: Record<string, Scalar>;
  /** The screens the app already has, so the new one can link to them instead of inventing duplicates. */
  routes: { path: string; title: string }[];
};
/** `thinking`: summary of the model's reasoning, present only when asked for and produced. */
export type GenerateResult = { spec: Spec | null; message: string; thinking?: string; usage?: GenerateUsage };

/** A content block as the API returns it; echoed back verbatim (thinking blocks included). */
export type Block = { type: string; [k: string]: unknown };
type Msg = Anthropic.Beta.BetaMessageParam;
/** One model turn. Abstracted so tests can script the model. */
/** `on` (optional) is told about the turn while it is still being written: reasoning text, and each tool call as it starts. */
export type StepEvents = {
  thinking: (delta: string) => void; tool: (name: string) => void;
  /** The input of the tool call being written, as parsed so far (providers that stream it). */
  input?: (name: string, snapshot: unknown) => void;
};
export type StepUsage = { input: number; output: number };
export type LlmStep = (args: { system: string; messages: Msg[]; llm: LlmOptions; on?: StepEvents; signal?: AbortSignal }) =>
  Promise<{ content: Block[]; stopReason: string | null; usage?: StepUsage }>;

export class GenerateError extends Error {}

const MAX_STEPS = 12;
const QUERY_ROWS = 50;
const MAX_TEXT_ATTACHMENT = 200_000;

export const TOOLS = [
  {
    name: "esegui_query",
    description: "Esegue una query strutturata sul database (e sulle collezioni già esistenti dell'app corrente) e restituisce al massimo 50 righe. Usala per esplorare i dati (valori distinti, intervalli di date, esempi di righe, conteggi) prima di costruire l'interfaccia, o per rispondere a domande sui dati.",
    input_schema: { type: "object" as const, properties: { query: z.toJSONSchema(QuerySchema, { reused: "inline" }) }, required: ["query"] },
  },
  {
    name: "prepara_libreria",
    description: "Scarica sul server un pacchetto npm (es. \"@cloudscape-design/components@3\", \"antd@5\") e restituisce la versione esatta, i percorsi importabili e i file CSS. Usalo prima di scrivere un nodo custom con una libreria, per importare dai percorsi giusti. Le versioni già scaricate sono condivise tra le viste.",
    input_schema: { type: "object" as const, properties: { pacchetto: { type: "string" } }, required: ["pacchetto"] },
  },
  {
    name: "crea_tabella",
    description: "Crea una nuova tabella nel database (con un id numerico automatico) e restituisce il suo schema. Usala quando l'utente chiede esplicitamente una tabella o dati condivisi da più schermate; per i dati propri di una mini app usa invece le collections. Non modifica né elimina tabelle esistenti.",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string", description: "snake_case minuscolo, es. fornitori" },
        colonne: { type: "array", items: {
          type: "object",
          properties: {
            nome: { type: "string" }, tipo: { type: "string", enum: ["text", "number", "integer", "boolean", "date"] },
            obbligatoria: { type: "boolean" }, riferimento: { type: "string", description: "tabella a cui la colonna punta (per id), se è una chiave esterna" },
          },
          required: ["nome", "tipo"],
        } },
      },
      required: ["nome", "colonne"],
    },
  },
  {
    name: "inserisci_righe",
    description: "Inserisce righe in una tabella del database (non in una collezione). Ogni riga è un oggetto colonna → valore, senza id. O tutte o nessuna: se una riga non è valida ricevi l'errore e niente viene inserito.",
    input_schema: {
      type: "object" as const,
      properties: { tabella: { type: "string" }, righe: { type: "array", items: { type: "object" } } },
      required: ["tabella", "righe"],
    },
  },
  {
    name: "mostra_interfaccia",
    // Streamed as it is written, so the interface can be previewed while it takes shape; the input is validated below.
    eager_input_streaming: true,
    description: "Mostra all'utente l'interfaccia descritta dalla spec, sostituendo quella corrente. Se la spec non è valida riceverai l'elenco dei problemi da correggere. 'messaggio' è una frase breve per l'utente su cosa hai fatto. 'dati_iniziali' (opzionale) riempie con documenti di esempio le collezioni appena create.",
    input_schema: {
      type: "object" as const,
      properties: {
        messaggio: { type: "string" }, spec: specJsonSchema(),
        dati_iniziali: { type: "array", items: {
          type: "object", properties: { collezione: { type: "string" }, documenti: { type: "array", items: { type: "object" } } }, required: ["collezione", "documenti"],
        } },
      },
      required: ["messaggio", "spec"],
    },
  },
];

export function makeClaudeStep(client: Anthropic): LlmStep {
  return async ({ system, messages, llm, on, signal }) => {
    const { fallback } = modelInfo(llm.model);
    const stream = client.beta.messages.stream({
      model: llm.model,
      max_tokens: 64000,
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      // These models always reason (adaptive); "summarized" only makes that reasoning readable in the response.
      thinking: { type: "adaptive", display: llm.thinking ? "summarized" : "omitted" },
      output_config: { effort: llm.effort },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: TOOLS as Anthropic.Beta.BetaTool[],
      messages,
    }, { signal });
    if (on) {
      let tool = "";
      stream.on("inputJson", (_delta, snapshot) => on.input?.(tool, snapshot));
      stream.on("thinking", (delta) => { if (delta) on.thinking(delta); });
      stream.on("streamEvent", (e) => {
        if (e.type === "content_block_start" && e.content_block.type === "tool_use") { tool = e.content_block.name; on.tool(tool); }
      });
    }
    const msg = await stream.finalMessage();
    const u = msg.usage;
    return {
      content: msg.content as unknown as Block[], stopReason: msg.stop_reason,
      usage: { input: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), output: u.output_tokens },
    };
  };
}

/** Text of a response. After a mid-stream server-side fallback, only what follows the last fallback block counts. */
export function responseText(content: readonly { type: string; text?: unknown }[]): string {
  const start = content.map((b) => b.type).lastIndexOf("fallback") + 1;
  return content.slice(start).flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("");
}

/** One table as the model reads it: "clienti: id integer PK, nome text obbligatorio, …". */
const describeTable = (t: DbSchema["tables"][number]) =>
  `${t.name}: ` + t.columns.map((c) =>
    `${c.name} ${c.type}${c.pk ? " PK" : ""}${c.generated ? " calcolata (sola lettura)" : ""}${c.notNull && !c.pk ? " obbligatorio" : ""}${c.references ? ` -> ${c.references.table}.${c.references.column}` : ""}`,
  ).join(", ");

export function buildSystemPrompt(schema: DbSchema): string {
  const tables = schema.tables.map((t) => `- ${describeTable(t)}`).join("\n");

  return `Sei Sibilla, l'assistente di una webapp che costruisce mini webapp su misura per l'utente: non solo viste sui dati esistenti, ma piccoli gestionali completi con i propri dati.

# Come lavori
- Se l'utente chiede una vista o una modifica, costruiscila e mostrala con lo strumento mostra_interfaccia.
- Se l'utente fa una domanda (sui dati, su cosa puoi fare, ecc.) rispondi a parole, brevemente, senza cambiare la vista. Usa esegui_query per rispondere con numeri veri.
- Prima di costruire, se ti serve, esplora i dati con esegui_query: valori distinti, intervalli di date, esempi di righe. Non inventare valori.
- Se mostra_interfaccia ti restituisce errori, correggi e riprova.
- Usa gli allegati come contesto: uno screenshot o una bozza indicano layout e stile desiderati (riproducili fedelmente, anche nei colori), un documento indica requisiti o contenuti.
- Interpreta le richieste con iniziativa: se l'utente è vago, proponi una vista ricca e utile.
- Scrivi in italiano: titoli ed etichette brevi e chiari; i messaggi all'utente in una o due frasi.

# Mini webapp e collezioni
Quando ciò che l'utente chiede non è coperto dalle tabelle del database (attività, note, prenotazioni, spese, inventario, contatti, ticket, un CRM su misura, ...) crea tu l'archivio dati: dichiara in "collections" le collezioni dell'app.
- collections: [{ name, fields: [{ name, type, required, references }] }]. name e nomi dei campi in snake_case minuscolo; type "text"|"number"|"boolean"|"date"; references = nome di un'altra collezione o di una tabella del database a cui il campo punta (per id), altrimenti null.
- Ogni collezione ha in automatico id, creato_il e aggiornato_il (sola lettura): non dichiararli e non metterli nei form.
- Una collezione si usa esattamente come una tabella: in query (anche in join, anche con le tabelle del database), table, chart, kpi, filter, form e nel modulo "sibilla" dei nodi custom. Il backend (lettura, creazione, modifica, eliminazione, validazione) è già pronto, non serve altro.
- Sono documenti, non tabelle relazionali: niente migrazioni. Puoi aggiungere campi in qualsiasi momento (i documenti esistenti li avranno vuoti). Non rinominare né togliere campi o collezioni che contengono dati, se l'utente non lo chiede: i dati salvati resterebbero orfani.
- Modella con criterio: una collezione per ogni entità, campi "stato"/"categoria"/"priorità" come text con pochi valori fissi (nei form e nei filtri usa input "select" con "choices": l'elenco dei valori ammessi, e optionsQuery null), date come "date", importi come "number".
- Con una collezione nuova passa in dati_iniziali qualche documento realistico (5-10) così l'app non si apre vuota: [{ collezione, documenti: [{ campo: valore }] }]. Elenca prima le collezioni referenziate; in un campo references metti la posizione (da 1) del documento nella lista della collezione referenziata. Non usarlo se l'utente vuole partire da zero.
- Una mini webapp è completa: elenco con ricerca e filtri, creazione, modifica ed eliminazione, numeri di sintesi, e sezioni in tabs se le entità sono più di una. Non fermarti a una tabella in sola lettura.
- Se invece i dati esistono già nel database, usa quelli: non duplicarli in una collezione.

# Navigazione tra schermate
Un'app può avere più schermate, ognuna su una rotta ("/", "/clienti", "/clienti/:id", "/ordini/nuovo": segmenti minuscoli, parametri come ":nome"). Tu scrivi sempre UNA schermata per volta; le altre vengono generate quando l'utente ci arriva e poi conservate, una per rotta: "/clienti/:id" è la stessa schermata per tutti i clienti.
- Nodo "link": { type: "link", label, variant: "button"|"link", to, params: [{ name, value }], intent }. Porta a un'altra schermata. Per ogni parametro ":nome" della rotta indica in params il valore (letterale o "{{variabile}}").
- table.rowLink: { to, params: [{ name, field }], intent }. Cliccando una riga si apre la schermata; ogni parametro prende il valore da un campo prodotto dalla query (es. to "/clienti/:id", params [{ name: "id", field: "id" }]).
- Nei nodi custom: import { navigate } from "sibilla"; navigate("/clienti/:id", { id: 12 }, "scheda del cliente").
- "intent" descrive con precisione cosa deve mostrare e permettere la schermata di destinazione: è l'unica cosa che saprai quando dovrai generarla. Usa la stessa rotta (stesso "to") per la stessa destinazione, ovunque compaia.
- Puoi collegare rotte che non esistono ancora: non generarle tu, basta il link.
- In una schermata con parametri di rotta dichiara in "variables" una variabile con lo stesso nome di ogni parametro (default null): la webapp la valorizza. Usala nelle query con "{{nome}}".

# Gestire il database
Se l'utente chiede di creare una tabella o di caricare dati nel database, fallo con crea_tabella e inserisci_righe, poi conferma a parole cosa hai creato (e mostra una vista solo se l'ha chiesta). Le date sono testo "YYYY-MM-DD", i booleani 0/1. Crea prima le tabelle a cui altre fanno riferimento. Non puoi modificare o eliminare tabelle esistenti: se serve, di' all'utente che può farlo dalla schermata Database.

# Che vista costruire
Sibilla non fa solo dashboard. Scegli la forma giusta per il compito: elenco con dettaglio, scheda di un record, modulo o wizard di inserimento, kanban per stato, calendario o timeline per date, confronto tra elementi, report testuale con numeri, pagina di benvenuto, catalogo a schede, mappa, ecc.
Hai due modi per costruire, combinabili nella stessa vista:
1. I componenti Sibilla (nodi descritti sotto): già nel brand, veloci e affidabili. Preferiscili per tabelle, grafici, KPI, filtri e form.
2. Il nodo "custom": un componente React scritto da te, con qualsiasi libreria npm. Usalo quando l'utente chiede una libreria specifica (Ant Design, MUI, Mantine, Chakra, framer-motion, …), uno stile molto diverso da quello di Sibilla, o una vista che i nodi non coprono (kanban con drag&drop, calendario, timeline, galleria, animazioni, layout editoriali). Una vista può essere interamente un nodo custom (radice) o avere nodi custom accanto a nodi standard.

# Stile
- Per cambi di stile su una vista fatta di nodi standard (tema scuro, colori, font, angoli, densità) usa il campo "style" della spec, senza riscrivere i nodi:
  colorScheme "light"|"dark"; primary e primaryForeground (colore principale e testo su di esso); background, foreground; palette (colori dei grafici); radius "none"|"small"|"medium"|"large"; font "sans"|"serif"|"mono"|"rounded"; density "compact"|"normal"|"comfortable".
  Colori come #hex, rgb(), hsl() o oklch(). Assicura un buon contrasto. Lascia null ciò che non cambia.
- Se lo stile richiesto va oltre questi parametri, o l'utente chiede un'altra libreria UI, rifai la vista (o la parte) con un nodo custom.

# Nodo custom
{ type: "custom", source, libraries, stylesheets, height }
- source: un modulo ES con JSX e "export default function NomeVista() { ... }" senza props. Importa gli hook da "react".
- libraries: i pacchetti npm che usi, con versione (es. "@cloudscape-design/components@3", "antd@5", "@mui/material@6", "framer-motion"). Il server li scarica con npm e li impacchetta solo per questa vista; le stesse versioni sono condivise tra viste. Se l'utente indica una libreria, usala. Per librerie che non conosci bene o con import a sottopercorsi, chiama prima prepara_libreria e usa la "libreria" (nome@versione) e i percorsi "importabili" che ti restituisce. Includi le dipendenze peer necessarie (MUI richiede @emotion/react e @emotion/styled; Cloudscape richiede anche @cloudscape-design/global-styles).
- Puoi importare dalla radice o da sottopercorsi esistenti del pacchetto (es. import Button from "@cloudscape-design/components/button"). Puoi importare i CSS direttamente nel codice (es. import "@cloudscape-design/global-styles/index.css") oppure elencarli in stylesheets.
- stylesheets: percorsi CSS dentro i pacchetti dichiarati (es. "@mantine/core/styles.css"); vuoto se li importi nel codice o non servono.
- height: null per altezza automatica, oppure pixel fissi (es. per calendari a tutta altezza).
- Tailwind CSS è disponibile, con i colori di Sibilla: bg-background, text-foreground, bg-card, text-card-foreground, bg-primary, text-primary-foreground, bg-muted, text-muted-foreground, border-border, bg-accent; font predefinito IBM Plex Sans.
- Dati: niente fetch né rete. Usa il modulo "sibilla":
  import { useQuery, query, createRecord, updateRecord, deleteRecord } from "sibilla";
  const { rows, loading, error, reload } = useQuery(q, vars)   // q = query strutturata (stesso formato sotto), vars opzionale per i placeholder {{x}}
  const rows = await query(q, vars); await createRecord(tabella, valori); await updateRecord(tabella, id, valori); await deleteRecord(tabella, id)
  Tabelle e collezioni si usano allo stesso modo. updateRecord cambia solo i campi passati (utile per spostare una scheda di stato, spuntare un'attività, ecc.).
  Le query strutturate devono rispettare le stesse regole e lo stesso schema del database. Dopo una scrittura chiama reload().
- Gestisci loading ed error, e lo stato vuoto. Codice compatto e leggibile (indicativamente sotto le 300 righe).
- Un nodo custom è una foglia: niente figli.

# La spec
- Lista piatta di nodi; ogni nodo ha "id" unico e "parentId" (null solo per l'unico nodo radice). Usa come radice uno "stack" column, di solito con un "heading" livello 1 e un "text" introduttivo breve.
- Contenitori: stack (row/column), grid (columns 1-4), card (raggruppa con titolo), tabs (figli solo "tab"; i contenuti dentro ciascun tab), dialog.
- Foglie: heading, text (supporta markdown: grassetto, elenchi, link), kpi, table, chart, filter, form, custom.
- "span" (1-4, opzionale) su un figlio di una grid: quante colonne occupa. Usalo per layout asimmetrici (es. grafico span 2 + kpi span 1 in una grid da 3).
- Layout: raggruppa per significato (KPI in alto in una grid, poi grafici affiancati, poi tabelle). Usa card con titolo per sezioni, tabs se i contenuti sono tanti.

# Quando usare cosa
- kpi: un singolo numero. Query con un aggregato, "field" = alias dell'aggregato.
- chart: trend (line/area), confronti (bar), composizione (pie, poche categorie). "x" = campo categoria/data, "y" = campi numerici prodotti dalla query. "stacked" (opzionale) impila più serie bar/area.
- table: elenchi. Ogni columns[].field deve essere prodotto dalla query. "pageSize" (opzionale, default 10) per la paginazione; l'utente può ordinare cliccando le intestazioni.
- filter: scrive in una variabile; le query la usano con value "{{nome}}" in where. Variabile vuota = filtro ignorato. Per "select" fornisci optionsQuery (valori distinti via groupBy) e optionValue/optionLabel, oppure "choices" (elenco fisso di valori) con optionsQuery null.
- Creare record: "dialog" con triggerLabel (es. "Nuovo cliente") che contiene un "form" mode "create" con tutti i campi obbligatori.
- Modificare record: table con rowClick { setVariable: "selId", field: "id" }, poi "dialog" con openVariable "selId" e triggerLabel null che contiene un "form" mode "edit" con recordIdVariable "selId". Con allowDelete true il form offre anche "Elimina" (con conferma): usalo nelle mini webapp.
- Nei form: niente chiave primaria né colonne calcolate; per chiavi esterne (e campi references delle collezioni) input "select" con optionsQuery sulla tabella o collezione referenziata; per valori fissi input "select" con "choices".
- Dichiara in "variables" ogni variabile usata.

# Query strutturate
- Solo tabelle e colonne elencate sotto. Campi della tabella principale senza prefisso; di tabelle in join "tabella.colonna". Con un join elenca sempre i campi in select, senza nomi duplicati.
- join: { table, on: [campo della tabella principale, colonna della tabella in join] }.
- where op: eq, neq, gt, gte, lt, lte, like (contiene), in (value = lista separata da virgole), is_null, not_null (value null).
- aggregates: { fn: count|count_distinct|sum|avg|min|max, field, as }; count può usare field "*". orderBy può usare un alias di aggregato.
- Date (testo ISO "YYYY-MM-DD"): nei campi di select/groupBy/orderBy puoi usare year(campo), month(campo) ("YYYY-MM"), day(campo); il nome della colonna prodotta è "year_campo", "month_campo", "day_campo".
- limit: null usa il default (200), massimo 1000.

# Modifiche
Se ricevi la spec corrente, parti da quella e cambia solo ciò che l'utente chiede, mantenendo gli id dei nodi invariati e riportando invariate le sue collections (aggiungi pure campi o collezioni nuove).

# Schema del database
${tables}`;
}

/** Column names a query yields. Empty select + no aggregates = all columns of the main table. */
function outputs(q: Query, schema: DbSchema): Set<string> {
  if (!q.select.length && !q.aggregates.length)
    return new Set(schema.tables.find((t) => t.name === q.table)?.columns.map((c) => c.name) ?? []);
  return new Set([...q.select.map(outputName), ...q.aggregates.map((a) => a.as)]);
}

/** Everything wrong with a spec against the tree rules and the live DB schema. */
export function specProblems(spec: Spec, base: DbSchema): string[] {
  const invalid = collectionProblems(spec.collections, base);
  if (invalid.length) return invalid;
  const schema = withCollections(base, spec.collections);
  const problems = validateSpecTree(spec);
  for (const n of spec.nodes) {
    for (const q of nodeQueries(n)) problems.push(...checkQuery(q, schema).map((e) => `${n.id}: ${e}`));
    const need = (q: Query, fields: (string | null)[]) => {
      const out = outputs(q, schema);
      for (const f of fields) if (f !== null && !out.has(f)) problems.push(`${n.id}: il campo ${f} non è prodotto dalla query`);
    };
    if (n.type === "table") need(n.query, [...n.columns.map((c) => c.field), n.rowClick?.field ?? null, ...(n.rowLink?.params.map((p) => p.field) ?? [])]);
    if (n.type === "chart") {
      need(n.query, [n.x, ...n.y]);
      if (!n.y.length) problems.push(`${n.id}: un grafico richiede almeno un campo in y`);
      const extra = n.query.groupBy.map(outputName).filter((g) => g !== n.x);
      if (extra.length)
        problems.push(`${n.id}: il grafico raggruppa anche per ${extra.join(", ")}: ogni valore di x deve comparire una sola volta (raggruppa solo per ${n.x}, oppure usa più serie in y)`);
    }
    if (n.type === "kpi") need(n.query, [n.field]);
    if (n.type === "filter" && n.optionsQuery) need(n.optionsQuery, [n.optionValue, n.optionLabel]);
    if (n.type === "form") {
      const t = schema.tables.find((x) => x.name === n.table);
      if (!t) { problems.push(`${n.id}: tabella inesistente ${n.table}`); continue; }
      for (const f of n.fields) {
        const c = t.columns.find((x) => x.name === f.column);
        if (!c) problems.push(`${n.id}: colonna inesistente ${n.table}.${f.column}`);
        else if (c.pk || c.generated) problems.push(`${n.id}: la colonna ${f.column} non è modificabile, non va nel form`);
        if (f.optionsQuery) need(f.optionsQuery, [f.optionValue, f.optionLabel]);
      }
      if (n.mode === "create") {
        const present = new Set(n.fields.map((f) => f.column));
        for (const c of t.columns)
          if (c.notNull && !c.hasDefault && !c.pk && !c.generated && !present.has(c.name))
            problems.push(`${n.id}: il form di creazione deve includere il campo obbligatorio ${c.name}`);
      }
    }
  }
  return problems;
}

const IMAGE = /^image\/(png|jpeg|gif|webp)$/;
const TEXT = /^(text\/.+|application\/(json|xml|csv))$/;

export function buildUserContent(input: GenerateInput): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = input.attachments.map((a) => {
    if (IMAGE.test(a.mediaType))
      return { type: "image", source: { type: "base64", media_type: a.mediaType as "image/png", data: a.data } };
    if (a.mediaType === "application/pdf")
      return { type: "document", title: a.name, source: { type: "base64", media_type: "application/pdf", data: a.data } };
    if (TEXT.test(a.mediaType))
      return { type: "text", text: `Allegato «${a.name}»:\n${a.data.slice(0, MAX_TEXT_ATTACHMENT)}` };
    throw new GenerateError(`Tipo di allegato non supportato: ${a.name} (${a.mediaType})`);
  });
  blocks.push({ type: "text", text: requestText(input) });
  return blocks;
}

const PROCEDURAL = `Modalità procedurale: costruisci solo la schermata iniziale dell'app (rotta "/"), essenziale e veloce da generare: i numeri o l'elenco principali e, soprattutto, i link (nodi "link", "rowLink" sulle tabelle) verso le altre schermate dell'app, ognuno con un "intent" preciso. Non costruire qui dettagli, form di modifica, report: mettili dietro un link, verranno generati quando l'utente ci entra.`;

/** The text of the request as the model reads it. */
function requestText(input: GenerateInput): string {
  const nav = input.navigate;
  if (nav) {
    const params = routeParams(nav.to);
    return [
      `Schermata di provenienza (rotta ${nav.from}):\n${JSON.stringify(input.currentSpec)}`,
      `Schermate che l'app ha già: ${nav.routes.map((r) => `${r.path} («${r.title}»)`).join(", ") || "solo quella iniziale"}.`,
      `L'utente ha scelto «${nav.label}», che porta alla rotta ${nav.to}${params.length ? ` (ora con ${JSON.stringify(nav.params)})` : ""}. Questa schermata non esiste ancora: generala ora.`,
      `Cosa deve fare: ${nav.intent || nav.label}`,
      `Regole: scrivi SOLO la schermata di destinazione, non quella di provenienza né l'intera app. "title" è il titolo di questa schermata.`
        + (params.length ? ` Dichiara le variabili ${params.join(", ")} (default null) e usale nelle query con "{{nome}}": la schermata vale per qualunque valore, non scrivere valori fissi.` : "")
        + ` Riporta le collections dell'app così come sono (aggiungine se la schermata ne richiede di nuove) e mantieni lo stesso "style".`
        + ` Metti in alto un link per tornare a ${nav.from} e, dove serve, link ad altre schermate (esistenti o ancora da generare).`
        + ` In "messaggio" di' in una frase cosa trova l'utente qui.`,
    ].join("\n\n");
  }
  if (input.currentSpec) return `Spec corrente:\n${JSON.stringify(input.currentSpec)}\n\nRichiesta: ${input.prompt}`;
  return input.mode === "procedural" ? `${PROCEDURAL}\n\nRichiesta: ${input.prompt}` : input.prompt;
}

type Row = Record<string, Scalar>;
type Deps = {
  schema: DbSchema; step: LlmStep; libraries: LibraryStore;
  /** Runs an exploration query, seeing the collections of the app being edited. */
  query: (q: Query, app: AppScope) => Row[];
  seed?: (app: AppScope, items: SeedItem[]) => void;
  /** Changing the database itself: creating a table returns the schema that includes it. */
  tables?: { create: (def: unknown) => DbSchema; insert: (table: string, rows: unknown) => number };
};

const ShowInput = z.object({
  messaggio: z.string(), spec: z.unknown(),
  dati_iniziali: z.array(z.object({ collezione: z.string(), documenti: z.array(z.record(z.string(), ScalarSchema)) })).optional(),
});
const QueryInput = z.object({ query: QuerySchema });
const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

/** Readable reasoning of one model turn (empty unless summaries were requested). */
const thinkingText = (content: Block[]) =>
  content.flatMap((b) => (b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim() ? [b.thinking.trim()] : []));

/** Agentic run: the model may explore data and must call mostra_interfaccia to show a screen, or answer in text. */
const TOOL_STATUS: Record<string, string> = {
  esegui_query: "Esploro i dati…", prepara_libreria: "Preparo le librerie…", mostra_interfaccia: "Costruisco l'interfaccia…",
  crea_tabella: "Creo la tabella…", inserisci_righe: "Inserisco i dati…",
};

const PREVIEW_EVERY_MS = 500;

/** `signal`: aborted when the user stops the run or goes away; the provider call is cancelled and the run ends with AbortError. */
export async function generate(input: GenerateInput, deps: Deps, progress?: (p: GenerateProgress) => void, signal?: AbortSignal): Promise<GenerateResult> {
  const system = buildSystemPrompt(deps.schema);
  let schema = deps.schema; // grows if a table is created during the run
  const messages: Msg[] = [...input.history, { role: "user", content: buildUserContent(input) }];
  // A draft gets its app id the first time it declares collections; from then on it travels inside the spec.
  const current: AppScope = { id: input.currentSpec?.appId ?? randomUUID(), collections: input.currentSpec?.collections ?? [] };

  const llm = input.llm ?? DEFAULT_LLM;
  const thoughts: string[] = [];
  const used = { input: 0, output: 0, any: false };
  const done = (r: GenerateResult): GenerateResult => ({
    ...r,
    ...(llm.thinking && thoughts.length ? { thinking: thoughts.join("\n\n") } : {}),
    ...(used.any ? { usage: { inputTokens: used.input, outputTokens: used.output, cost: usageCost(llm.model, used.input, used.output) } } : {}),
  });

  const status = (text: string) => progress?.({ type: "status", text });
  let streamed = false; // separates the reasoning of successive turns in the live view
  const on: StepEvents | undefined = progress && {
    thinking: (delta) => { progress({ type: "thinking", text: delta }); streamed = true; },
    tool: (name) => status(TOOL_STATUS[name] ?? "Sto lavorando…"),
    input: (name, snapshot) => {
      const spec = name === "mostra_interfaccia" && (snapshot as { spec?: unknown } | null)?.spec;
      if (!spec || Date.now() - previewed < PREVIEW_EVERY_MS) return;
      previewed = Date.now();
      progress({ type: "preview", spec });
    },
  };
  let previewed = 0;

  for (let i = 0; i < MAX_STEPS; i++) {
    status(i === 0 ? "Leggo la richiesta…" : "Proseguo…");
    if (streamed) { progress?.({ type: "thinking", text: "\n\n" }); streamed = false; }
    signal?.throwIfAborted();
    const { content, stopReason, usage } = await deps.step({ system, messages, llm, on, signal });
    if (usage) { used.input += usage.input; used.output += usage.output; used.any = true; }
    thoughts.push(...thinkingText(content));
    if (stopReason === "refusal") throw new GenerateError("Richiesta rifiutata dal modello");
    messages.push({ role: "assistant", content: content as unknown as Anthropic.Beta.BetaContentBlockParam[] });

    const calls = content.filter((b) => b.type === "tool_use") as unknown as { id: string; name: string; input: unknown }[];
    if (!calls.length) {
      if (stopReason === "max_tokens") throw new GenerateError("Risposta troppo lunga, riprova con una richiesta più semplice");
      return done({ spec: null, message: responseText(content).trim() || "Non ho nulla da aggiungere." });
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const c of calls) {
      const reply = (text: string, isError = false) =>
        results.push({ type: "tool_result", tool_use_id: c.id, content: text, ...(isError ? { is_error: true } : {}) });

      if (c.name === "esegui_query") {
        const q = QueryInput.safeParse(c.input);
        if (!q.success) { reply(`Query non valida: ${issues(q.error).join("; ")}`, true); continue; }
        try {
          const rows = deps.query({ ...q.data.query, limit: Math.min(q.data.query.limit ?? QUERY_ROWS, QUERY_ROWS) }, current);
          reply(JSON.stringify(rows));
        } catch (e) { reply((e as Error).message, true); }
      } else if (c.name === "prepara_libreria") {
        const pkg = (c.input as { pacchetto?: unknown })?.pacchetto;
        if (typeof pkg !== "string") { reply("Indica il pacchetto in \"pacchetto\"", true); continue; }
        try {
          const info = await deps.libraries.info(pkg);
          reply(JSON.stringify({ pacchetto: info.name, versione: info.version, libreria: `${info.name}@${info.version}`,
            descrizione: info.description, importabili: info.imports, css: info.css }));
        } catch (e) { reply((e as Error).message, true); }
      } else if (c.name === "crea_tabella" || c.name === "inserisci_righe") {
        const i = c.input as { nome?: unknown; colonne?: { nome?: unknown; tipo?: unknown; obbligatoria?: unknown; riferimento?: unknown }[]; tabella?: unknown; righe?: unknown } | null;
        try {
          if (!deps.tables) throw new Error("Qui non posso modificare il database");
          if (c.name === "crea_tabella") {
            schema = deps.tables.create({
              name: i?.nome,
              columns: (Array.isArray(i?.colonne) ? i.colonne : []).map((x) => ({ name: x.nome, type: x.tipo, required: x.obbligatoria === true, references: x.riferimento || null })),
            });
            reply(`Tabella creata: ${describeTable(schema.tables.find((t) => t.name === i?.nome)!)}`);
          } else {
            reply(`${deps.tables.insert(String(i?.tabella), i?.righe)} righe inserite in ${String(i?.tabella)}`);
          }
        } catch (e) { reply(e instanceof z.ZodError ? issues(e).join("; ") : (e as Error).message, true); }
      } else if (c.name === "mostra_interfaccia") {
        const s = ShowInput.safeParse(c.input);
        const spec = s.success ? SpecSchema.safeParse(s.data.spec) : null;
        if (!s.success || !spec?.success) {
          reply(`Spec non valida:\n- ${(s.success ? issues(spec!.error!) : issues(s.error)).join("\n- ")}`, true);
          continue;
        }
        status("Verifico l'interfaccia…");
        const problems = [...specProblems(spec.data, schema), ...await customProblems(spec.data, deps.libraries)];
        // A screen reached by a route with parameters must take them as variables: it is kept and reused for every value.
        const declared = new Set(spec.data.variables.map((v) => v.name));
        for (const p of input.navigate ? routeParams(input.navigate.to) : [])
          if (!declared.has(p)) problems.push(`manca la variabile "${p}" per il parametro di rotta :${p}`);
        if (problems.length) { reply(`Spec non valida, correggi:\n- ${problems.join("\n- ")}`, true); continue; }
        const { appId: _ignored, screens: _screens, procedural: _mode, ...rest } = spec.data;
        const collections = rest.collections ?? [];
        const procedural = input.mode === "procedural" || !!input.currentSpec?.procedural;
        const shown: Spec = { ...rest, ...(collections.length ? { appId: current.id } : {}), ...(procedural ? { procedural: true } : {}) };
        if (collections.length && s.data.dati_iniziali?.length) {
          try { deps.seed?.({ id: current.id, collections }, s.data.dati_iniziali); }
          catch (e) { reply(`Dati iniziali non validi, correggi:\n- ${(e as Error).message}`, true); continue; }
        }
        return done({ spec: shown, message: s.data.messaggio });
      } else {
        reply(`Strumento sconosciuto: ${c.name}`, true);
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new GenerateError("Non sono riuscita a completare la richiesta, riprova riformulandola");
}
