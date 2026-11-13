# Sibilla — Design della PoC

Data: 2026-11-13

## Intento

Sibilla è una webapp generativa con pochissimo codice di default. L'utente descrive in linguaggio naturale l'interfaccia che gli serve in quel momento; Claude la genera rispettando branding, UI di base, colori e libreria componenti di Sibilla. Le interfacce generate si possono salvare, riaprire, versionare, modificare ed eliminare.

La PoC si mostra **al cliente**. Deve dimostrare due cose:
1. da un prompt nasce una UI vera, coerente con il brand, che mostra e modifica dati reali;
2. il backend di Sibilla genera la UI **e** serve le API da cui la UI prende i dati.

Il caso d'uso è **generico**: nessun dominio specifico. Backend e database devono essere il più flessibili possibile.

## Obiettivi

- Prompt → schermata renderizzata con componenti shadcn e tema Sibilla, popolata da dati del backend.
- Iterazione in chat sulla schermata corrente ("aggiungi un grafico per mese", "togli la colonna X").
- CRUD delle interfacce salvate, con versioni: salva, apri, modifica (= nuova versione), elimina, apri una versione precedente.
- Backend agnostico rispetto ai dati: scopre lo schema del DB da solo, e la UI generata funziona su qualunque tabella.

## Non-obiettivi (per questa PoC)

- Autenticazione, multi-utente, permessi.
- Connettori verso DB reali del cliente (si usa un DB demo; il punto di sostituzione è isolato).
- Generazione di codice React libero: Claude non scrive codice eseguito nel browser.
- Deploy in produzione, test automatici estesi.

## Anti-obiettivi (fallimento anche se "funziona")

- Una UI generata che esce dal brand (colori, font, componenti non di Sibilla).
- Claude che esegue SQL arbitrario sul database.
- Una demo che si rompe davanti al cliente per un JSON malformato: ogni spec viene validata, e su errore si fa un retry automatico prima di mostrare un errore leggibile.

## Decisioni prese dall'utente

- **Frontend:** React + shadcn/ui, inizializzato con `npx shadcn@latest init --preset b6Fkv2o66` (il preset definisce tema, colori, font, raggi). Il preset è la fonte unica di verità per lo stile.
- **Generazione UI tramite descrizione strutturata (UI spec JSON):** Claude produce un documento JSON che descrive quali componenti usare, come disporli e a quali dati collegarli; il frontend lo renderizza. Salvare/versionare un'interfaccia = salvare quella spec.
- **Backend da costruire**, flessibile, che fa sia generazione UI sia API dati.

## Architettura (scelte mie, marcate come tali)

### Struttura repo *(mia scelta)*

```
sibilla/
  web/      Vite + React + TypeScript + shadcn (preset b6Fkv2o66)
  server/   Node 22+ + TypeScript + Hono + @anthropic-ai/sdk + SQLite
  shared/   schema Zod della UI spec, usato sia da web sia da server
```

npm workspaces. Un solo linguaggio (TypeScript) su tutto lo stack, così la UI spec è un unico schema Zod condiviso.

### Database *(mia scelta)*

- SQLite su file, seed con dati demo generici: `clienti`, `prodotti`, `ordini`, `righe_ordine` (qualche centinaio di righe, date distribuite su 12 mesi per avere grafici sensati).
- Tabelle interne di Sibilla con prefisso `sib_` (escluse dall'introspezione):
  - `sib_interfaces(id, nome, descrizione, created_at, updated_at)`
  - `sib_versions(id, interface_id, numero, spec_json, prompt, created_at)` — `numero` incrementale per interfaccia.
- Il DB demo è sostituibile: l'unico punto che parla SQL è il modulo di query del server. Passare a Postgres = cambiare driver e dialetto lì.

### API del backend

**Dati (generiche, guidate dallo schema):**
- `GET /api/schema` → tabelle, colonne, tipi, chiavi esterne (introspezione del DB, cache in memoria).
- `POST /api/query` → esegue una **query strutturata** (non SQL):
  ```json
  {
    "table": "ordini",
    "select": ["stato", "data"],
    "where": [{ "field": "stato", "op": "eq", "value": "{{filtroStato}}" }],
    "groupBy": ["stato"],
    "aggregates": [{ "fn": "sum", "field": "totale", "as": "totale" }],
    "orderBy": [{ "field": "totale", "dir": "desc" }],
    "limit": 100,
    "join": [{ "table": "clienti", "on": ["cliente_id", "id"] }]
  }
  ```
  Il server valida ogni tabella/colonna contro lo schema introspezionato, accetta solo operatori in whitelist, costruisce SQL parametrizzato. Limite massimo righe (es. 1000).
- `POST /api/records/:table` `{ values }` → crea un record; ritorna il record creato.
- `PATCH /api/records/:table/:id` `{ values }` → modifica un record (per chiave primaria); ritorna il record aggiornato.
  - Valida tabella e colonne contro lo schema, rifiuta colonne sconosciute, la chiave primaria e le tabelle `sib_`; converte i valori al tipo di colonna; errori di vincolo (NOT NULL, FK) tornano come 400 con messaggio leggibile per campo.
  - Eliminazione record: fuori scope *(mia scelta: richiesti solo crea/modifica)*.

**Generazione:**
- `POST /api/generate` `{ prompt, currentSpec?, history? }` → `{ spec }`.
  - Modello `claude-opus-5-5`, structured outputs (`output_config.format` con JSON schema derivato dallo schema Zod), streaming con `finalMessage()`, `effort: "medium"`, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
  - System prompt stabile (cacheabile): identità e regole di Sibilla, catalogo componenti con quando usarli, regole di layout, schema DB corrente. Prompt utente + spec corrente (se in modifica) nei messaggi.
  - Validazione Zod della risposta + verifica che ogni query referenzi tabelle/colonne esistenti. Su fallimento: un retry con l'errore inviato a Claude; poi errore leggibile.
  - Controllo `stop_reason` (`refusal`, `max_tokens`) prima di leggere il contenuto.

**Interfacce salvate:**
- `GET /api/interfaces` → elenco con ultima versione.
- `POST /api/interfaces` `{ nome, spec, prompt }` → crea interfaccia + versione 1.
- `GET /api/interfaces/:id` → dettaglio + elenco versioni.
- `GET /api/interfaces/:id/versions/:n` → spec di una versione.
- `POST /api/interfaces/:id/versions` `{ spec, prompt }` → nuova versione (n+1).
- `PATCH /api/interfaces/:id` `{ nome?, descrizione? }`.
- `DELETE /api/interfaces/:id` → elimina interfaccia e versioni.
- Ripristinare una versione vecchia = crearne una nuova con quella spec (la storia non si riscrive).

`ANTHROPIC_API_KEY` vive solo nel server.

### UI spec *(mia scelta, schema da raffinare in implementazione)*

```ts
type Spec = {
  title: string
  variables?: Record<string, { type: "string" | "number" | "date"; default?: unknown }>
  root: Node
}
```

Catalogo nodi iniziale (ognuno mappato a componenti shadcn):

| Nodo | Componente shadcn | Note |
|---|---|---|
| `stack` / `grid` | layout (div + classi tema) | contenitori, `columns` per grid |
| `card` | Card | titolo, descrizione, figli |
| `heading`, `text` | tipografia tema | |
| `kpi` | Card + valore grande | da una `query` con un aggregato |
| `table` | Table (data table) | colonne, ordinamento, paginazione client |
| `chart` | Chart (Recharts) | `bar` / `line` / `area` / `pie`, assi da campi query |
| `filter` | Select / Input / date picker | scrive in una `variable` |
| `tabs` | Tabs | figli per tab |
| `badge` | Badge | mapping valore → variante |
| `form` | Form (Input, Textarea, Select, Switch, date picker, Button) | `table`, `mode: create \| edit`, `recordId` da variabile, `fields: [{ column, label, input, optionsQuery? }]` |
| `dialog` | Dialog / Sheet | contenitore aperto da un bottone o da una riga, tipicamente per un `form` |

Interazioni per la scrittura dati:
- `table` può avere `onRowClick: { setVariable, field }` (es. imposta `selectedId` = `id` della riga) per aprire un form di modifica.
- In `edit` il form carica il record via `/api/query` e salva via `PATCH`; in `create` salva via `POST`.
- I `select` di campi chiave esterna prendono le opzioni da `optionsQuery` (es. elenco clienti).
- Dopo un salvataggio riuscito: toast di conferma, chiusura del dialog, ricarica di tutte le query della schermata.
- Validazione lato client dai tipi di colonna (required se NOT NULL); il server resta comunque l'autorità.

I nodi dati hanno `query` (formato di `/api/query`); i placeholder `{{variabile}}` vengono risolti dal renderer e la query si riesegue quando la variabile cambia. Claude **non** sceglie colori, font o classi CSS: lo stile viene solo dal renderer e dal preset.

Se gli structured outputs non accettano lo schema ricorsivo, si passa a una lista piatta di nodi con `parentId` (decide il builder).

### Frontend *(mia scelta)*

Layout a tre zone:
- **Sidebar sinistra:** logo/wordmark Sibilla, "Nuova interfaccia", elenco interfacce salvate.
- **Canvas centrale:** la spec renderizzata; header con titolo, selettore versione, "Salva" / "Salva come nuova versione", "Elimina".
- **Pannello chat destro:** prompt e storico della sessione; ogni risposta aggiorna il canvas.

Una schermata generata resta bozza finché non viene salvata. Su un'interfaccia salvata, ogni modifica salvata crea la versione successiva. Stati di caricamento con Skeleton, errori con Alert/Sonner.

Lingua dell'interfaccia di Sibilla e dei prompt di sistema: italiano *(mia scelta)*.

## Lasciato al builder

- Forma esatta dello schema Zod e dei messaggi di sistema.
- Dimensione e contenuto del seed demo.
- Componenti shadcn da installare oltre a quelli del catalogo.
- Gestione errori/HTTP nel dettaglio.

## Decisioni successive dell'utente

- **Scrittura dati:** la UI generata può anche **creare e modificare record** tramite form (vedi `form`, `dialog`, `/api/records`).

## Evoluzione 2026-11-13 (richiesta: più libertà, contesto, voce, layout)

Decisioni prese senza domande (l'utente ha chiesto di procedere):

- **Generazione agentica.** Claude lavora in un loop con due strumenti: `esegui_query` (esplora i dati, max 50 righe, stessa query strutturata validata) e `mostra_interfaccia` (`{messaggio, spec}`; se la spec non è valida riceve l'elenco dei problemi e si corregge, fino a 12 passi). Può anche rispondere solo a parole: `/api/generate` restituisce `{ spec | null, message }`. Resta vietato codice libero nel browser.
- **Structured outputs abbandonati:** lo schema supera il limite API di 16 parametri con union; la spec viaggia come input_schema (non strict) del tool e viene validata da Zod + `specProblems`.
- **Allegati:** immagini (png/jpeg/gif/webp), PDF, file di testo (txt/md/csv/json/xml/html), testi incollati lunghi (≥1500 caratteri) e immagini incollate. Max 10 MB per file, ~18 MB totali per richiesta. Inviati solo nel turno corrente; nello storico resta il nome.
- **Voce:** dettatura con Web Speech API del browser (it-IT, Chrome/Edge/Safari; il pulsante non appare dove non è supportata). Nota: l'audio passa dal servizio del browser.
- **Spec più ricca:** `span` (1-4) sui figli di una grid, `pageSize` e ordinamento cliccabile sulle tabelle, `stacked` sui grafici, `text` in markdown. Query: operatori `in`, `is_null`, `not_null`; `count_distinct`; funzioni data `year()/month()/day()` (colonna prodotta `month_data`, ecc.). Campi nuovi opzionali: le spec salvate prima restano valide.
- **Layout:** sidebar e chat richiudibili, canvas centrato max 1400px, stato vuoto con suggerimenti calcolati dallo schema del DB, card annidate appiattite, legenda sui grafici a torta.

## Evoluzione: viste libere con librerie npm installate sul server

- **Stile per vista:** `spec.style` (tema chiaro/scuro, colori, palette, raggi, font, densità) applicato come variabili CSS al contenitore della vista.
- **Nodo `custom`:** componente React scritto da Claude. Il server installa le `libraries` con `npm install --ignore-scripts` in `server/.sibilla-libs/<nome>@<versione-esatta>/` (cartella condivisa da tutte le viste che usano quella versione; versioni diverse restano separate) e impacchetta la vista con esbuild in un unico JS+CSS (font/immagini inline), con una sola copia di React e il ponte dati `sibilla`. Bundle in cache per hash di contenuto (`_bundles/`).
- **Isolamento:** iframe `srcdoc` senza `allow-same-origin`; CSP che permette script solo dal nostro server, `connect-src 'none'`; i dati passano solo da postMessage verso query/crea/modifica record. Nessun CDN di librerie (funziona dietro proxy aziendali).
- **Strumento `prepara_libreria`:** Claude installa un pacchetto e ne legge versione, percorsi importabili e CSS prima di scrivere il codice. Errori di build tornano a Claude come errori dello strumento.
- **Limiti noti:** nessuna pulizia automatica delle versioni non più usate; la prima installazione di una libreria grande può richiedere decine di secondi.
