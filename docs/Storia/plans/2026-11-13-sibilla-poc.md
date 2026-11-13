# Sibilla PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Webapp generativa: l'utente descrive una schermata, Claude produce una UI spec JSON, il frontend la renderizza con shadcn sui dati del backend; le interfacce si salvano con versioni.

**Architecture:** Monorepo npm workspaces. `shared/` contiene lo schema Zod della UI spec e della query strutturata (unica fonte di verità per web, server e JSON schema inviato a Claude). `server/` (Hono + node:sqlite) espone API dati generiche guidate dall'introspezione, scrittura record, CRUD interfacce/versioni e generazione via Claude. `web/` (Vite + React + shadcn preset) è un renderer di spec + chat + gestione interfacce.

**Tech Stack:** Node 24, TypeScript, npm workspaces, Zod v4, Hono + @hono/node-server, `node:sqlite` (DatabaseSync, built-in), @anthropic-ai/sdk, Vite + React 19, shadcn/ui (preset `b6Fkv2o66`), Recharts (via shadcn chart), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-sibilla-design.md`

## Global Constraints

- shadcn inizializzato con il preset `b6Fkv2o66` (`npx shadcn@latest init --preset b6Fkv2o66`; se la sintassi del CLI differisce, verificare con `npx shadcn@latest init --help` / `npx shadcn@latest create --help` e usare l'equivalente). Nessun colore/font hardcoded: solo token del tema.
- Claude non sceglie mai stile, colori o classi: la spec non ha campi di stile.
- Claude non scrive SQL: solo la `Query` strutturata, validata contro lo schema introspezionato; SQL sempre parametrizzato; identificatori solo da whitelist dello schema.
- Tabelle interne con prefisso `sib_`: escluse da introspezione, query e scrittura.
- Modello `claude-opus-5-5`, `output_config.effort: "medium"`, `output_config.format` JSON schema, beta `server-side-fallback-2026-07-01` con `fallbacks: "default"`, streaming + `finalMessage()`, `max_tokens: 32000`. Controllare `stop_reason` (`refusal`, `max_tokens`) prima di leggere il contenuto.
- Lo schema JSON per Claude non può essere ricorsivo e ogni oggetto ha `additionalProperties: false` → la spec è una **lista piatta di nodi con `parentId`**, nessun `Record<>`, campi opzionali espressi come `nullable` + required.
- `ANTHROPIC_API_KEY` solo nel server (env). Mai nel bundle web.
- Limite righe query: default 200, massimo 1000.
- UI e prompt di sistema in italiano.
- Eliminazione record: fuori scope. Auth/multi-utente: fuori scope.

## Review Focus

1. **Variabile filtro vuota** (`""`/`null`): la clausola `where` che la usa viene **rimossa**, la tabella mostra tutte le righe (non zero). → test in Task 3.
2. **Spec di Claude con tabella/colonna inesistente**: rifiutata dal server, un retry con l'errore, poi errore leggibile; se una query fallisce comunque a runtime, solo quel nodo mostra un Alert, il resto della schermata resta in piedi. → test in Task 6 e Task 9.
3. **Salvataggio form che viola un vincolo** (NOT NULL, FK inesistente, tipo sbagliato): 400 con messaggio per campo mostrato nel form, nessun crash. → test in Task 4 e Task 10.
4. **Eliminazione dell'interfaccia attualmente aperta**: il canvas torna a bozza vuota, sidebar aggiornata. → test in Task 11.
5. **Risultato vuoto** per kpi/chart/table: stato vuoto ("Nessun dato"), mai eccezioni su `rows[0]` undefined. → test in Task 9.

---

## File Structure

```
package.json                      workspaces: shared, server, web
shared/src/spec.ts                Zod: Query, Node (union), Spec + validateSpecTree
shared/src/jsonSchema.ts          specJsonSchema() → JSON schema per Claude
shared/src/index.ts
shared/test/spec.test.ts
server/src/db.ts                  openDb(path), migrate, seed
server/src/seed.ts                dati demo deterministici
server/src/schema.ts              introspect(db) → DbSchema
server/src/query.ts               buildQuery / runQuery
server/src/records.ts             createRecord / updateRecord
server/src/interfaces.ts          CRUD interfacce + versioni
server/src/generate.ts            buildSystemPrompt, generateSpec
server/src/app.ts                 Hono app (tutte le route)
server/src/index.ts               avvio server su :8787
server/test/*.test.ts
web/                              Vite + shadcn
web/src/api.ts                    client fetch tipizzato
web/src/renderer/*.tsx            un file per famiglia di nodi
web/src/renderer/vars.ts          resolveQuery(query, vars)
web/src/App.tsx                   layout sidebar / canvas / chat
```

---

### Task 1: Monorepo + schema condiviso della spec

**Files:**
- Create: `package.json`, `.gitignore`, `tsconfig.base.json`, `shared/package.json`, `shared/src/spec.ts`, `shared/src/jsonSchema.ts`, `shared/src/index.ts`
- Test: `shared/test/spec.test.ts`

**Interfaces:**
- Produces (da `@sibilla/shared`):
  - `Scalar = string | number | boolean | null`
  - `QuerySchema`, `type Query = { table: string; select: string[]; join: {table: string; on: [string, string]}[]; where: {field: string; op: "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"like"; value: Scalar}[]; groupBy: string[]; aggregates: {fn: "count"|"sum"|"avg"|"min"|"max"; field: string; as: string}[]; orderBy: {field: string; dir: "asc"|"desc"}[]; limit: number | null }`. Campi qualificati ammessi: `"clienti.nome"`. Valori `"{{nome}}"` = variabile.
  - `NodeSchema` = discriminated union su `type`; ogni nodo ha `id: string`, `parentId: string | null`. Tipi e props:
    - `stack {direction: "row"|"column"}`, `grid {columns: number}`, `card {title: string; description: string|null}`
    - `heading {text; level: 1|2|3}`, `text {text}`
    - `kpi {label; query: Query; field: string; format: "number"|"currency"|"percent"}`
    - `table {title: string|null; query; columns: {field; label; format: "text"|"number"|"currency"|"date"|"badge"}[]; rowClick: {setVariable: string; field: string} | null}`
    - `chart {title: string|null; kind: "bar"|"line"|"area"|"pie"; query; x: string; y: string[]}`
    - `filter {variable; label; input: "select"|"search"|"date"; optionsQuery: Query|null; optionValue: string|null; optionLabel: string|null}`
    - `tabs {}` con figli `tab {label}`
    - `dialog {title; triggerLabel: string|null; openVariable: string|null}` (aperto dal bottone o quando `openVariable` è valorizzata)
    - `form {table; mode: "create"|"edit"; recordIdVariable: string|null; submitLabel: string; fields: {column; label; input: "text"|"textarea"|"number"|"date"|"select"|"switch"; optionsQuery: Query|null; optionValue: string|null; optionLabel: string|null}[]}`
  - `SpecSchema`, `type Spec = { title: string; variables: {name: string; type: "string"|"number"|"date"; default: string|number|null}[]; nodes: Node[] }`
  - `validateSpecTree(spec: Spec): string[]` → lista errori (vuota = ok): esattamente un nodo con `parentId: null`; ogni `parentId` esiste; id unici; nessun ciclo; figli di `tabs` solo `tab`; `tab` solo sotto `tabs`; nodi foglia (`heading,text,kpi,table,chart,filter,form`) senza figli; variabili referenziate (`{{x}}`, `setVariable`, `openVariable`, `recordIdVariable`, `filter.variable`) dichiarate in `variables`.
  - `specJsonSchema(): object` → `z.toJSONSchema(SpecSchema)` con `additionalProperties: false` su ogni oggetto e nessun `$ref` ricorsivo.

- [ ] **Step 1: Setup** — `git init`; root `package.json` con `"workspaces": ["shared","server","web"]`, `"type": "module"`; dev deps root `typescript`, `vitest`; `shared` dipende da `zod@^4`. `.gitignore`: `node_modules`, `dist`, `*.db`, `.env`.

- [ ] **Step 2: Write failing tests** in `shared/test/spec.test.ts`:

```ts
const sample: Spec = {
  title: "Ordini",
  variables: [{ name: "stato", type: "string", default: null }, { name: "sel", type: "number", default: null }],
  nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "f", parentId: "root", type: "filter", variable: "stato", label: "Stato", input: "select",
      optionsQuery: { table: "ordini", select: ["stato"], join: [], where: [], groupBy: ["stato"], aggregates: [], orderBy: [], limit: null },
      optionValue: "stato", optionLabel: "stato" },
    { id: "t", parentId: "root", type: "table", title: null,
      query: { table: "ordini", select: ["id", "stato"], join: [], where: [{ field: "stato", op: "eq", value: "{{stato}}" }], groupBy: [], aggregates: [], orderBy: [], limit: 50 },
      columns: [{ field: "stato", label: "Stato", format: "badge" }], rowClick: { setVariable: "sel", field: "id" } },
  ],
};
test("sample spec parses", () => expect(SpecSchema.parse(sample)).toEqual(sample));
test("valid tree has no errors", () => expect(validateSpecTree(sample)).toEqual([]));
test("two roots rejected", () => expect(validateSpecTree({ ...sample, nodes: [...sample.nodes, { id: "r2", parentId: null, type: "text", text: "x" }] })).not.toEqual([]));
test("unknown parent rejected", ...parentId "nope" → errors non vuoti);
test("cycle rejected", ...a→b→a → errors non vuoti);
test("child under leaf rejected", ...nodo con parentId "t" → errors non vuoti);
test("undeclared variable rejected", ...value "{{boh}}" → errors contiene "boh");
test("json schema is non-recursive and closed", () => {
  const s = JSON.stringify(specJsonSchema());
  expect(s).not.toContain('"$ref"');
  // ogni "type":"object" ha additionalProperties false: walk ricorsivo dello schema
});
```

- [ ] **Step 3: Run** `npx vitest run shared` → FAIL (moduli mancanti).
- [ ] **Step 4: Implement** `spec.ts`, `jsonSchema.ts`, `index.ts` come da Interfaces. Usare `z.strictObject` ovunque. `QuerySchema` è definito una volta e riusato (non ricorsivo, quindi Zod può inlinearlo: usare l'opzione di `z.toJSONSchema` che evita `$ref`/`$defs` — `reused: "inline"` — o post-processare inlinando le `$defs`).
- [ ] **Step 5: Run** `npx vitest run shared` → PASS.
- [ ] **Step 6: Commit** `feat(shared): UI spec schema and tree validation`.

---

### Task 2: Database, seed demo, introspezione

**Files:**
- Create: `server/package.json`, `server/src/db.ts`, `server/src/seed.ts`, `server/src/schema.ts`
- Test: `server/test/schema.test.ts`

**Interfaces:**
- Produces:
  - `openDb(path: string): DatabaseSync` — apre (`:memory:` ammesso), `PRAGMA foreign_keys = ON`, crea tabelle demo + `sib_interfaces`, `sib_versions` se mancanti, chiama `seed(db)` se `clienti` è vuota.
  - Tabelle demo:
    - `clienti(id INTEGER PK, nome TEXT NOT NULL, email TEXT NOT NULL, citta TEXT, segmento TEXT NOT NULL)` — 40 righe
    - `prodotti(id INTEGER PK, nome TEXT NOT NULL, categoria TEXT NOT NULL, prezzo REAL NOT NULL, attivo INTEGER NOT NULL DEFAULT 1)` — 25 righe
    - `ordini(id INTEGER PK, cliente_id INTEGER NOT NULL REFERENCES clienti(id), data TEXT NOT NULL, stato TEXT NOT NULL, totale REAL NOT NULL)` — 300 righe, date distribuite sugli ultimi 12 mesi, stato in `nuovo|in_lavorazione|spedito|consegnato|annullato`
    - `righe_ordine(id INTEGER PK, ordine_id INTEGER NOT NULL REFERENCES ordini(id), prodotto_id INTEGER NOT NULL REFERENCES prodotti(id), quantita INTEGER NOT NULL, prezzo_unitario REAL NOT NULL)`; `ordini.totale` = somma righe.
    - `sib_interfaces(id INTEGER PK, nome TEXT NOT NULL, descrizione TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
    - `sib_versions(id INTEGER PK, interface_id INTEGER NOT NULL REFERENCES sib_interfaces(id) ON DELETE CASCADE, numero INTEGER NOT NULL, spec_json TEXT NOT NULL, prompt TEXT, created_at TEXT NOT NULL, UNIQUE(interface_id, numero))`
  - Seed deterministico (PRNG con seed fisso, niente `Math.random`).
  - `type Column = { name: string; type: "integer"|"real"|"text"; notNull: boolean; pk: boolean; hasDefault: boolean; references: { table: string; column: string } | null }`
  - `type DbSchema = { tables: { name: string; columns: Column[] }[] }`
  - `introspect(db: DatabaseSync): DbSchema` — via `sqlite_master`, `PRAGMA table_info`, `PRAGMA foreign_key_list`; esclude `sib_%` e `sqlite_%`.

- [ ] **Step 1: Failing tests:** `introspect(openDb(":memory:"))` → nomi tabelle esattamente `["clienti","ordini","prodotti","righe_ordine"]` (ordinati); `ordini.cliente_id.references` = `{table:"clienti", column:"id"}`; `clienti.id.pk === true`; `count(*)` ordini = 300; due `openDb(":memory:")` producono la stessa prima riga di `ordini` (determinismo).
- [ ] **Step 2: Run** `npx vitest run server/test/schema.test.ts` → FAIL.
- [ ] **Step 3: Implement** `db.ts`, `seed.ts`, `schema.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): sqlite demo db and schema introspection`.

---

### Task 3: Query strutturata

**Files:**
- Create: `server/src/query.ts`
- Test: `server/test/query.test.ts`

**Interfaces:**
- Consumes: `Query`, `DbSchema`.
- Produces:
  - `class QueryError extends Error` (messaggio leggibile in italiano).
  - `checkQuery(q: Query, schema: DbSchema): string[]` — errori di validazione (tabelle/colonne inesistenti, `sib_`, join `on` non valido, `as` duplicati, `orderBy` su campo non selezionato né alias). Usata anche da `generate.ts`. I placeholder `{{x}}` non sono errori.
  - `buildQuery(q: Query, schema: DbSchema): { sql: string; params: Scalar[] }` — lancia `QueryError` se `checkQuery` non è vuoto. Campi non qualificati si riferiscono a `q.table`. Identificatori quotati `"tabella"."colonna"`. `like` → `LIKE ?` con `%valore%`. `limit` null → 200, cap 1000. Con `aggregates` senza `select` va bene (es. KPI).
  - `resolveVars(q: Query, vars: Record<string, Scalar>): Query` in `shared/src/vars.ts`, esportata da `@sibilla/shared` (la usano server e web) — sostituisce `"{{x}}"` con `vars[x]`; **rimuove** le clausole `where` la cui variabile è `null`, `undefined` o `""`. Testata in questo task.
  - `runQuery(db, schema, q: Query, vars: Record<string, Scalar>): { rows: Record<string, Scalar>[] }`.

- [ ] **Step 1: Failing tests** (db seedato in memoria):
  - select semplice `clienti` `["id","nome"]` limit 5 → 5 righe con chiavi `id,nome`.
  - groupBy `stato` + `count(id) as n` su ordini → somma di `n` = 300.
  - join `ordini`→`clienti` on `["cliente_id","id"]`, select `["clienti.nome","totale"]` → righe con chiavi `nome`, `totale`.
  - where `stato eq "{{s}}"` con vars `{s: ""}` → stesse righe di senza where (Review Focus 1).
  - where con vars `{s: "spedito"}` → tutte le righe hanno `stato === "spedito"`.
  - tabella `sib_versions` → `QueryError`; colonna `"nome; DROP TABLE clienti"` → `QueryError`; value `"'; DROP TABLE clienti; --"` → 0 righe e `clienti` ancora presente.
  - limit `5000` → al massimo 1000 righe.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `shared/src/vars.ts` (`resolveVars`) e `server/src/query.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): validated structured query builder`.

---

### Task 4: Scrittura record

**Files:**
- Create: `server/src/records.ts`
- Test: `server/test/records.test.ts`

**Interfaces:**
- Produces:
  - `class RecordError extends Error { fieldErrors: Record<string, string> }`
  - `createRecord(db, schema, table: string, values: Record<string, Scalar>): Record<string, Scalar>`
  - `updateRecord(db, schema, table: string, id: number, values: Record<string, Scalar>): Record<string, Scalar>`
  - Regole: tabella deve esistere in `schema` (quindi mai `sib_`); colonne sconosciute → errore su quel campo; chiave primaria nei values → errore; coercizione: `integer` da stringa numerica / boolean (`true`→1), `real` da stringa numerica, `text` da numero; `""` → `null`; `create` con colonna `notNull && !hasDefault && !pk` mancante o null → `fieldErrors[col] = "Campo obbligatorio"`; vincolo FK violato → `fieldErrors[col] = "Valore non valido"` (verifica preventiva con SELECT sulla tabella referenziata); `update` su id inesistente → `RecordError` "Record non trovato".

- [ ] **Step 1: Failing tests:** crea cliente valido → ritorna oggetto con `id` numerico; crea senza `nome` → `RecordError` con `fieldErrors.nome`; crea ordine con `cliente_id: 99999` → `fieldErrors.cliente_id`; `prezzo: "12.5"` su prodotti → salvato come `12.5`; update ordine `stato: "spedito"` → riletto spedito; update con `id` nei values → errore; update id 99999 → "Record non trovato"; table `sib_interfaces` → errore.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): validated record create/update`.

---

### Task 5: Interfacce e versioni

**Files:**
- Create: `server/src/interfaces.ts`
- Test: `server/test/interfaces.test.ts`

**Interfaces:**
- Produces (i due tipi in `shared/src/interfaces.ts`, esportati da `@sibilla/shared`; le funzioni in `server/src/interfaces.ts`):
  - `type InterfaceSummary = { id: number; nome: string; descrizione: string | null; updatedAt: string; latestVersion: number }`
  - `type InterfaceDetail = InterfaceSummary & { versions: { numero: number; prompt: string | null; createdAt: string }[] }`
  - `listInterfaces(db): InterfaceSummary[]` (ordinate per `updatedAt` desc)
  - `createInterface(db, { nome, descrizione?, spec, prompt }): InterfaceDetail` → versione 1
  - `getInterface(db, id): InterfaceDetail | null`
  - `getVersion(db, id, numero): { numero; spec: Spec; prompt: string | null; createdAt } | null`
  - `addVersion(db, id, { spec, prompt }): InterfaceDetail` → `numero = max + 1`, aggiorna `updated_at`
  - `renameInterface(db, id, { nome?, descrizione? }): InterfaceDetail | null`
  - `deleteInterface(db, id): boolean` (cascade sulle versioni)
  - Lo `spec` è validato con `SpecSchema.parse` + `validateSpecTree` prima di salvare; se invalido lancia `Error` con gli errori.

- [ ] **Step 1: Failing tests:** create → `latestVersion 1`; addVersion due volte → versions `[1,2,3]`; `getVersion(id,2).spec` deep-equal a quello salvato; ripristino = `addVersion` con spec della v1 → v4 uguale a v1; delete → `getInterface` null e nessuna riga in `sib_versions`; spec con due root → throw.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): saved interfaces with versions`.

---

### Task 6: Generazione con Claude

**Files:**
- Create: `server/src/generate.ts`
- Test: `server/test/generate.test.ts`

**Interfaces:**
- Consumes: `specJsonSchema`, `SpecSchema`, `validateSpecTree`, `checkQuery`, `DbSchema`.
- Produces:
  - `buildSystemPrompt(schema: DbSchema): string` — in italiano. Contenuto: chi è Sibilla e che l'output è solo una UI spec; catalogo nodi con quando usarli (kpi per numeri singoli, chart per trend/confronti, table per elenchi, filter+variabile per filtrare, dialog+form per creare/modificare, rowClick per aprire un form di modifica); regole layout (un root `stack` column, `grid` per KPI affiancati, max ~8 nodi dati); regole query (solo tabelle/colonne elencate, campi qualificati nei join, placeholder `{{var}}` dichiarati in `variables`); in modifica: parti dalla spec corrente e cambia solo ciò che è richiesto, mantenendo gli id esistenti; schema DB serializzato (tabelle, colonne, tipi, FK). Deterministico (nessun timestamp) per il prompt caching.
  - `type GenerateInput = { prompt: string; currentSpec: Spec | null; history: { role: "user" | "assistant"; content: string }[] }`
  - `type LlmCall = (args: { system: string; messages: Anthropic.MessageParam[] }) => Promise<{ text: string; stopReason: string | null }>`
  - `makeClaudeCall(client: Anthropic): LlmCall` — `client.beta.messages.stream({ model: "claude-opus-5-5", max_tokens: 32000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium", format: { type: "json_schema", schema: specJsonSchema() } }, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages })` → `.finalMessage()`; concatena i blocchi `text`. Se il typing del SDK non accetta un campo, verificare la versione installata e la doc in `shared/live-sources.md` della skill claude-api, non rimuovere il campo.
  - `class GenerateError extends Error`
  - `generateSpec(input: GenerateInput, deps: { schema: DbSchema; call: LlmCall }): Promise<Spec>` — messaggi = history + messaggio utente (se `currentSpec`, includerla come JSON prima del prompt). Dopo la risposta: `stopReason === "refusal"` → `GenerateError("Richiesta rifiutata dal modello")`; `"max_tokens"` → tratta come invalida; `JSON.parse` + `SpecSchema.safeParse` + `validateSpecTree` + `checkQuery` su ogni query/optionsQuery dei nodi e `form.table`/`form.fields[].column` contro lo schema. Se ci sono errori: **un** retry aggiungendo la risposta dell'assistente e un messaggio utente con l'elenco errori; se fallisce ancora → `GenerateError` con gli errori.

- [ ] **Step 1: Failing tests** con `LlmCall` finto:
  - risposta = spec valida → ritornata uguale.
  - prima risposta con colonna `ordini.inesistente`, seconda valida → ritorna la seconda; la seconda chiamata ha un ultimo messaggio utente che contiene `"inesistente"` (Review Focus 2).
  - due risposte invalide → `GenerateError`.
  - `stopReason: "refusal"` → `GenerateError` senza retry (call chiamata 1 volta).
  - `currentSpec` presente → il messaggio utente contiene `JSON.stringify(currentSpec)`.
  - `buildSystemPrompt(schema)` contiene `"righe_ordine"` e non contiene `"sib_"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): spec generation with validation and retry`.

---

### Task 7: App HTTP

**Files:**
- Create: `server/src/app.ts`, `server/src/index.ts`
- Test: `server/test/app.test.ts`

**Interfaces:**
- Produces `createApp(deps: { db: DatabaseSync; call: LlmCall }): Hono` con route (JSON in/out, errori `{ error: string, fieldErrors?: Record<string,string> }`):
  - `GET /api/schema` → `DbSchema`
  - `POST /api/query` `{ query: Query, vars: Record<string, Scalar> }` → `{ rows }`; `QueryError` → 400
  - `POST /api/records/:table` `{ values }` → 201 record; `PATCH /api/records/:table/:id` `{ values }` → 200 record; `RecordError` → 400 con `fieldErrors`
  - `POST /api/generate` `GenerateInput` → `{ spec }`; `GenerateError` → 422
  - `GET /api/interfaces`, `POST /api/interfaces`, `GET /api/interfaces/:id`, `GET /api/interfaces/:id/versions/:n`, `POST /api/interfaces/:id/versions`, `PATCH /api/interfaces/:id`, `DELETE /api/interfaces/:id` (404 se non esiste, spec invalida → 400)
  - Body validati con Zod (`SpecSchema`, `QuerySchema`, ...) → 400 su body invalido.
- `index.ts`: legge `ANTHROPIC_API_KEY` (errore chiaro all'avvio se manca), `SIBILLA_DB` (default `./sibilla.db`), porta `8787`. Script `npm run dev -w server` con `tsx watch`.

- [ ] **Step 1: Failing tests** via `app.request(...)` con db in memoria e `call` finto: un test per route felice + `POST /api/query` con tabella `sib_versions` → 400; `POST /api/records/clienti` senza nome → 400 con `fieldErrors.nome`; `DELETE` inesistente → 404.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run server` → PASS; `ANTHROPIC_API_KEY=x npm run dev -w server` e `curl -s localhost:8787/api/schema | head -c 200` → JSON con `clienti`.
- [ ] **Step 5: Commit** `feat(server): http api`.

---

### Task 8: Scaffold web + layout

**Files:**
- Create: `web/` (Vite React TS), `web/src/api.ts`, `web/src/App.tsx`
- Modify: `web/vite.config.ts` (proxy `/api` → `http://localhost:8787`)

**Interfaces:**
- Produces `api` in `web/src/api.ts`: `schema()`, `query(query, vars)`, `createRecord(table, values)`, `updateRecord(table, id, values)`, `generate(input)`, `listInterfaces()`, `getInterface(id)`, `getVersion(id, n)`, `createInterface(body)`, `addVersion(id, body)`, `renameInterface(id, body)`, `deleteInterface(id)`. Su status non-2xx lancia `ApiError { status; message; fieldErrors? }`. Tutti i tipi da `@sibilla/shared` (inclusi `InterfaceSummary`, `InterfaceDetail`).

- [ ] **Step 1:** `npm create vite@latest web -- --template react-ts`; Tailwind come richiesto da shadcn; init shadcn con preset `b6Fkv2o66` (vedi Global Constraints); `npx shadcn@latest add button card table chart select input textarea switch tabs dialog sheet badge skeleton alert sonner scroll-area separator sidebar popover calendar label form`.
- [ ] **Step 2:** `App.tsx`: layout a tre zone (shadcn `Sidebar` a sinistra con wordmark "Sibilla", bottone "Nuova interfaccia", elenco interfacce; canvas centrale con header titolo / selettore versione / Salva / Elimina; pannello chat a destra con storico messaggi, `Textarea` + invio). Stato in `App` con `useState`: `spec: Spec | null`, `current: { id: number; version: number } | null`, `history`, `loading`. Invio prompt → `api.generate` → `setSpec`; errori → toast. Nessun renderer ancora: canvas mostra `<pre>` del JSON.
- [ ] **Step 3: Verify:** `npm run dev -w server` + `npm run dev -w web`; aprire la pagina, inviare "mostrami gli ultimi ordini" → compare il JSON della spec. `npm run build -w web` senza errori. `grep -r "ANTHROPIC" web/src` → nessun risultato.
- [ ] **Step 4: Commit** `feat(web): scaffold, theme preset, app shell`.

---

### Task 9: Renderer della spec (lettura dati)

**Files:**
- Create: `web/src/renderer/Renderer.tsx`, `web/src/renderer/layout.tsx` (stack, grid, card, heading, text, tabs/tab), `web/src/renderer/data.tsx` (kpi, table, chart, filter), `web/src/renderer/useQuery.ts`
- Test: `web/src/renderer/Renderer.test.tsx` (vitest + @testing-library/react + jsdom)

**Interfaces:**
- Consumes: `Spec`, `resolveVars`, `api.query`.
- Produces:
  - `<Renderer spec={Spec} />` — costruisce la mappa figli da `parentId`, renderizza dal root; stato variabili inizializzato dai `default` di `spec.variables`; `setVar(name, value)` via context; `refreshKey` in context (incrementato dopo un salvataggio, Task 10) che fa rieseguire tutte le query.
  - `useSpecQuery(query: Query): { rows; loading; error }` — `resolveVars` con le variabili correnti, rifà la fetch quando cambiano variabili usate o `refreshKey`.
  - Ogni nodo dati: loading → `Skeleton`; errore → `Alert` dentro il nodo (il resto della pagina continua); 0 righe → testo "Nessun dato".
  - `kpi`: valore `rows[0]?.[field]` formattato con `Intl.NumberFormat("it-IT")` (`currency` EUR, `percent`).
  - `table`: shadcn `Table`, colonne da `columns`, `badge` → `Badge`, `date` → `toLocaleDateString("it-IT")`; `rowClick` → `setVar(setVariable, row[field])`.
  - `chart`: shadcn `ChartContainer` + Recharts per `kind`; `chartConfig` con colori `var(--chart-1..5)` del tema.
  - `filter`: `select` con opzioni da `optionsQuery` + voce "Tutti" (→ `null`); `search` input debounced 300ms; `date` input `type="date"`.
  - Nodo di tipo sconosciuto o dato malformato: non deve far cadere il renderer (error boundary per nodo).

- [ ] **Step 1: Failing tests** (mock `api.query`):
  - spec con kpi la cui query ritorna `[]` → testo "Nessun dato", nessuna eccezione (Review Focus 5).
  - `api.query` rifiuta per il nodo table → Alert nel nodo, l'heading fratello è ancora visibile (Review Focus 2).
  - select del filter su "Tutti" → `api.query` della table chiamata con vars in cui la variabile è `null`.
- [ ] **Step 2: Run** `npx vitest run web` → FAIL.
- [ ] **Step 3: Implement**; sostituire il `<pre>` in `App.tsx` con `<Renderer>`.
- [ ] **Step 4: Run** → PASS. Verifica manuale: prompt "dashboard vendite: KPI totale ordini e fatturato, grafico fatturato per mese, tabella ultimi ordini filtrabile per stato" → schermata completa con dati.
- [ ] **Step 5: Commit** `feat(web): spec renderer for layout and data nodes`.

---

### Task 10: Form e dialog (scrittura dati)

**Files:**
- Create: `web/src/renderer/form.tsx` (form, dialog)
- Test: `web/src/renderer/form.test.tsx`

**Interfaces:**
- Consumes: `api.createRecord`, `api.updateRecord`, `api.query`, `GET /api/schema` (per tipi e required), context variabili/`refreshKey`.
- Produces:
  - `dialog`: shadcn `Dialog`; se `triggerLabel` → bottone che apre; se `openVariable` → aperto quando la variabile non è null, chiusura rimette la variabile a `null`.
  - `form`: in `edit` legge l'id da `recordIdVariable` e carica il record con una `Query` `{table, select: fields.map(column) + pk, where: [{field: pk, op: "eq", value: id}], limit: 1}`; in `create` campi vuoti. Input per `input`; `select` con opzioni da `optionsQuery`. Required lato client da `notNull && !hasDefault`. Submit → create/update; successo → toast "Salvato", chiude il dialog padre (se c'è), incrementa `refreshKey`; `ApiError` con `fieldErrors` → messaggio sotto ciascun campo; altro errore → Alert nel form.

- [ ] **Step 1: Failing tests:** submit in create chiama `api.createRecord("clienti", {...})` con i valori inseriti; `ApiError` con `fieldErrors: { nome: "Campo obbligatorio" }` → testo "Campo obbligatorio" visibile sotto il campo nome (Review Focus 3); in edit con variabile id=5 → i campi sono precompilati dal risultato di `api.query`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Verifica manuale: prompt "tabella clienti, cliccando una riga apre un form per modificarla, più un bottone Nuovo cliente" → creare e modificare un cliente, la tabella si aggiorna.
- [ ] **Step 5: Commit** `feat(web): forms and dialogs for record create/edit`.

---

### Task 11: Gestione interfacce e versioni nella UI

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/InterfacesSidebar.tsx`, `web/src/CanvasHeader.tsx`
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Consumes: API interfacce (Task 8).
- Behavior:
  - Bozza (nessun `current`): "Salva" apre un dialog con nome/descrizione → `createInterface` → `current = {id, version: 1}`, sidebar aggiornata.
  - Interfaccia aperta: "Salva nuova versione" abilitato solo se la spec è cambiata rispetto alla versione caricata → `addVersion`. Il prompt salvato è l'ultimo prompt della chat.
  - Click in sidebar → `getInterface` + `getVersion(latest)`; chat resettata.
  - Selettore versione (`Select`) → carica quella versione in sola visualizzazione; "Ripristina questa versione" → `addVersion` con quella spec.
  - Rinomina dall'header (`renameInterface`).
  - "Elimina" con conferma (`AlertDialog`) → `deleteInterface`; se era quella aperta → canvas a bozza vuota, `current = null`, sidebar aggiornata.
  - "Nuova interfaccia" → bozza vuota, chat vuota.

- [ ] **Step 1: Failing test:** con API mockate, aprire interfaccia id 1, eliminarla e confermare → `deleteInterface(1)` chiamato, canvas mostra lo stato vuoto (es. testo "Descrivi l'interfaccia che ti serve"), la voce sparisce dalla sidebar (Review Focus 4).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` (tutto il monorepo) → PASS.
- [ ] **Step 5: Commit** `feat(web): save, version, restore, rename, delete interfaces`.

---

### Task 12: Verifica end-to-end della demo

**Files:**
- Create: `README.md` (avvio: `npm install`, `export ANTHROPIC_API_KEY=...`, `npm run dev -w server`, `npm run dev -w web`; reset dati: cancellare `server/sibilla.db`)

- [ ] **Step 1:** Avviare server e web con una chiave reale.
- [ ] **Step 2:** Con il browser (Playwright MCP) eseguire lo scenario demo: (a) prompt dashboard vendite → schermata con KPI, grafico, tabella filtrabile; (b) "aggiungi un grafico a torta degli ordini per stato" → la schermata si aggiorna mantenendo il resto; (c) Salva come "Vendite" → in sidebar; (d) altra modifica → Salva nuova versione → v2; (e) passare a v1 e ripristinarla → v3; (f) nuova interfaccia "gestione clienti" con form di modifica e creazione → creare un cliente e modificarne uno; (g) eliminare "Vendite".
- [ ] **Step 3:** Screenshot di (a) e (f) in tema chiaro; nessun errore in console del browser.
- [ ] **Step 4: Commit** `docs: readme and demo verification`.
