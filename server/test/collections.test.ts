import { expect, test } from "vitest";
import { collectionProblems, withCollections, type AppScope, type Query, type Spec } from "@sibilla/shared";
import { openDb } from "../src/db";
import { createApp } from "../src/app";
import { introspect } from "../src/schema";
import { runQuery } from "../src/query";
import { RecordError, createRecord, deleteRecord, seedDocs, updateRecord } from "../src/records";
import { generate, specProblems, type Block, type LlmStep } from "../src/generate";
import { createInterface, deleteInterface } from "../src/interfaces";
import { store } from "./fake-npm";

const collections: AppScope["collections"] = [
  { name: "progetti", fields: [{ name: "nome", type: "text", required: true, references: null }] },
  { name: "attivita", fields: [
    { name: "titolo", type: "text", required: true, references: null },
    { name: "stato", type: "text", required: false, references: null },
    { name: "ore", type: "number", required: false, references: null },
    { name: "fatta", type: "boolean", required: false, references: null },
    { name: "progetto_id", type: "number", required: false, references: "progetti" },
    { name: "cliente_id", type: "number", required: false, references: "clienti" },
  ] },
];
const q = (over: Partial<Query>): Query => ({ table: "attivita", select: [], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: null, ...over });

function setup(id = "app-1") {
  const db = openDb(":memory:");
  const base = introspect(db);
  const app: AppScope = { id, collections };
  return { db, base, app, schema: withCollections(base, collections) };
}

test("documents are created, read as rows, patched and deleted", () => {
  const { db, schema, app } = setup();
  const p = createRecord(db, schema, "progetti", { nome: "Sito" }, app);
  const a = createRecord(db, schema, "attivita", { titolo: "Bozza", stato: "aperta", ore: "2.5", fatta: false, progetto_id: p.id, cliente_id: 1 }, app);
  expect(a).toMatchObject({ titolo: "Bozza", stato: "aperta", ore: 2.5, fatta: 0, progetto_id: p.id });
  expect(a.creato_il).toBeTruthy();

  const upd = updateRecord(db, schema, "attivita", Number(a.id), { stato: "chiusa", ore: null }, app);
  expect(upd).toMatchObject({ titolo: "Bozza", stato: "chiusa", ore: null });

  deleteRecord(db, schema, "attivita", Number(a.id), app);
  expect(runQuery(db, schema, q({}), {}, app).rows).toEqual([]);
  expect(() => deleteRecord(db, schema, "attivita", Number(a.id), app)).toThrow(/non trovato/);
});

test("collections filter, aggregate and join like tables, also with database tables", () => {
  const { db, schema, app } = setup();
  const p = createRecord(db, schema, "progetti", { nome: "Sito" }, app);
  for (const [titolo, stato, ore] of [["A", "aperta", 1], ["B", "aperta", 2], ["C", "chiusa", 4]] as const)
    createRecord(db, schema, "attivita", { titolo, stato, ore, progetto_id: p.id, cliente_id: 1 }, app);

  expect(runQuery(db, schema, q({ select: ["stato"], groupBy: ["stato"], aggregates: [{ fn: "sum", field: "ore", as: "tot" }], orderBy: [{ field: "stato", dir: "asc" }] }), {}, app).rows)
    .toEqual([{ stato: "aperta", tot: 3 }, { stato: "chiusa", tot: 4 }]);
  const joined = runQuery(db, schema, q({
    select: ["titolo", "progetti.nome", "clienti.email"],
    join: [{ table: "progetti", on: ["progetto_id", "id"] }, { table: "clienti", on: ["cliente_id", "id"] }],
    where: [{ field: "stato", op: "eq", value: "{{s}}" }],
  }), { s: "chiusa" }, app).rows;
  expect(joined).toHaveLength(1);
  expect(joined[0]).toMatchObject({ titolo: "C", nome: "Sito" });
});

test("each app only sees and touches its own documents", () => {
  const { db, schema, app } = setup();
  const other: AppScope = { id: "app-2", collections };
  const a = createRecord(db, schema, "attivita", { titolo: "Mia" }, app);
  expect(runQuery(db, schema, q({}), {}, other).rows).toEqual([]);
  expect(() => updateRecord(db, schema, "attivita", Number(a.id), { titolo: "x" }, other)).toThrow(/non trovato/);
  expect(() => deleteRecord(db, schema, "attivita", Number(a.id), other)).toThrow(/non trovato/);
});

test("writes are validated against the declared fields", () => {
  const { db, schema, app } = setup();
  const errors = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RecordError).fieldErrors; } };
  expect(errors(() => createRecord(db, schema, "attivita", { stato: "x", ore: "tante", progetto_id: 999, boh: 1 }, app)))
    .toEqual({ titolo: "Campo obbligatorio", ore: "Numero non valido", progetto_id: "Valore non valido", boh: "Campo sconosciuto" });
  expect(errors(() => createRecord(db, schema, "attivita", { titolo: "x", creato_il: "ieri" }, app))).toEqual({ creato_il: "Campo calcolato, non modificabile" });
});

test("bad collection definitions are reported, including names that could reach SQL", () => {
  const { base } = setup();
  const f = { name: "x", type: "text" as const, required: false, references: null };
  expect(collectionProblems([{ name: "clienti", fields: [f] }], base).join()).toMatch(/esiste già/);
  expect(collectionProblems([{ name: "sib_docs", fields: [f] }], base).join()).toMatch(/nome non valido/);
  expect(collectionProblems([{ name: "note", fields: [{ ...f, name: "a') --" }, { ...f, name: "id" }, { ...f, references: "boh" }] }], base))
    .toEqual([expect.stringMatching(/campo non valido/), expect.stringMatching(/automatico/), expect.stringMatching(/inesistente/)]);
  expect(collectionProblems(collections, base)).toEqual([]);
});

test("seed fills new collections once, resolving references by position", () => {
  const { db, schema, app } = setup();
  const items = [
    { collezione: "progetti", documenti: [{ nome: "Uno" }, { nome: "Due" }] },
    { collezione: "attivita", documenti: [{ titolo: "A", progetto_id: 2 }] },
  ];
  seedDocs(db, schema, app, items);
  seedDocs(db, schema, app, items); // already populated: no duplicates
  const rows = runQuery(db, schema, q({ select: ["titolo", "progetti.nome"], join: [{ table: "progetti", on: ["progetto_id", "id"] }] }), {}, app).rows;
  expect(rows).toEqual([{ titolo: "A", nome: "Due" }]);

  const fresh = setup("app-3");
  expect(() => seedDocs(fresh.db, fresh.schema, fresh.app, [{ collezione: "progetti", documenti: [{ nome: "Ok" }, {}] }])).toThrow(/progetti\[2\].*nome/);
  expect(runQuery(fresh.db, fresh.schema, q({ table: "progetti" }), {}, fresh.app).rows).toEqual([]); // rolled back
});

const appSpec: Spec = {
  title: "Attività", variables: [], collections,
  nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "t", parentId: "root", type: "table", title: null, rowClick: null, query: q({ select: ["id", "titolo"] }), columns: [{ field: "titolo", label: "Titolo", format: "text" }] },
  ],
};

test("a spec may query and edit its own collections, but only declared fields", () => {
  const { base } = setup();
  expect(specProblems(appSpec, base)).toEqual([]);
  const bad: Spec = { ...appSpec, nodes: [appSpec.nodes[0], { ...appSpec.nodes[1], query: q({ select: ["boh"] }) } as Spec["nodes"][number]] };
  expect(specProblems(bad, base).join()).toMatch(/colonna inesistente boh/);
});

test("generating a mini webapp assigns its app id, seeds it, and keeps the id on later edits", async () => {
  const { db, base } = setup();
  const seeded: unknown[] = [];
  const show = (spec: unknown): Block => ({ type: "tool_use", id: "t1", name: "mostra_interfaccia", input: {
    messaggio: "Fatto", spec, dati_iniziali: [{ collezione: "progetti", documenti: [{ nome: "Uno" }] }] } });
  const step: LlmStep = async () => ({ content: [show({ ...appSpec, appId: "scelto-dal-modello" })], stopReason: "tool_use" });
  const deps = {
    schema: base, step, libraries: store().store, query: () => [],
    seed: (a: AppScope, items: Parameters<typeof seedDocs>[3]) => { seeded.push(a.id); seedDocs(db, withCollections(base, a.collections), a, items); },
  };
  const first = await generate({ prompt: "app attività", currentSpec: null, history: [], attachments: [] }, deps);
  const id = first.spec!.appId!;
  expect(id).toMatch(/^[\w-]{36}$/);
  expect(seeded).toEqual([id]);
  expect(runQuery(db, withCollections(base, collections), q({ table: "progetti", select: ["nome"] }), {}, { id, collections }).rows).toEqual([{ nome: "Uno" }]);

  const second = await generate({ prompt: "cambia", currentSpec: first.spec, history: [], attachments: [] }, deps);
  expect(second.spec!.appId).toBe(id);
});

test("deleting an interface deletes the documents of its app", () => {
  const { db, schema, app } = setup();
  createRecord(db, schema, "progetti", { nome: "Uno" }, app);
  createRecord(db, schema, "progetti", { nome: "Altro" }, { ...app, id: "app-2" });
  const d = createInterface(db, { nome: "App", spec: { ...appSpec, appId: app.id }, prompt: null });
  deleteInterface(db, d.id);
  expect(db.prepare("select app_id from sib_docs").all()).toEqual([{ app_id: "app-2" }]);
});

test("HTTP: records and queries carry the app scope; invalid scopes are refused", async () => {
  const step: LlmStep = async () => ({ content: [], stopReason: "end_turn" });
  const http = createApp({ db: openDb(":memory:"), step, libraries: store().store });
  const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const app = { id: "app-1", collections };

  const created = await http.request("/api/records/progetti", json("POST", { values: { nome: "Uno" }, app }));
  expect(created.status).toBe(201);
  const { id } = await created.json();
  expect((await http.request(`/api/records/progetti/${id}`, json("PATCH", { values: { nome: "Due" }, app }))).status).toBe(200);
  const rows = await (await http.request("/api/query", json("POST", { query: q({ table: "progetti", select: ["nome"] }), app }))).json();
  expect(rows).toEqual({ rows: [{ nome: "Due" }] });
  expect((await http.request("/api/query", json("POST", { query: q({ table: "progetti" }) }))).status).toBe(400); // no scope, no collection
  expect((await http.request(`/api/records/progetti/${id}`, json("DELETE", { app }))).status).toBe(204);

  const evil = { id: "app-1", collections: [{ name: "note", fields: [{ name: "x') or 1=1 --", type: "text", required: false, references: null }] }] };
  expect((await http.request("/api/query", json("POST", { query: q({ table: "note" }), app: evil }))).status).toBe(400);
  expect((await http.request("/api/records/ordini/1", json("DELETE", {}))).status).toBe(400); // referenced by righe_ordine
});
