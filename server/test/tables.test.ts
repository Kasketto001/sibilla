import { expect, test } from "vitest";
import type { Spec } from "@sibilla/shared";
import { openDb } from "../src/db";
import { createApp } from "../src/app";
import type { Block, LlmStep } from "../src/generate";
import { store } from "./fake-npm";

const libraries = store().store;
const json = (method: string, body?: unknown) => ({
  method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const all = (table: string) => ({ table, select: [], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: null });
const supplier = { name: "fornitori", columns: [
  { name: "nome", type: "text", required: true }, { name: "attivo", type: "boolean" }, { name: "cliente_id", type: "integer", references: "clienti" },
] };

test("tables can be created, filled, extended and dropped, and are usable at once", async () => {
  const app = createApp({ db: openDb(":memory:"), libraries, step: async () => ({ content: [], stopReason: "end_turn" }) });
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await app.request(`/api${path}`, json(method, body));
    return { status: r.status, body: await r.json() };
  };
  const columns = (schema: { tables: { name: string; columns: { name: string }[] }[] }, t: string) => schema.tables.find((x) => x.name === t)?.columns.map((c) => c.name);

  const made = await call("POST", "/tables", supplier);
  expect(made.status).toBe(201);
  expect(columns(made.body, "fornitori")).toEqual(["id", "nome", "attivo", "cliente_id"]);
  expect(columns((await call("GET", "/schema")).body, "fornitori")).toBeTruthy(); // the live schema follows

  // Bad names never reach SQL; the app's own tables and duplicates are refused.
  for (const bad of [{ ...supplier, name: "sib_docs" }, { ...supplier, name: "x; drop table clienti" }, supplier,
    { name: "altro", columns: [{ name: "id", type: "text" }] }, { name: "altro", columns: [{ name: "a", type: "text", references: "boh" }] }])
    expect((await call("POST", "/tables", bad)).status).toBe(400);

  expect((await call("POST", "/tables/fornitori/rows", { rows: [{ nome: "Alfa", attivo: true, cliente_id: 1 }, { nome: "Beta" }] })).body).toEqual({ inserted: 2 });
  const refused = await call("POST", "/tables/fornitori/rows", { rows: [{ nome: "Gamma" }, { attivo: true }] });
  expect(refused.status).toBe(400);
  expect(refused.body.error).toMatch(/Riga 2.*nome/);
  expect((await call("POST", "/query", { query: all("fornitori") })).body.rows.map((r: { nome: string }) => r.nome)).toEqual(["Alfa", "Beta"]); // nothing from the refused batch

  expect(columns((await call("POST", "/tables/fornitori/columns", { name: "citta", type: "text", required: true })).body, "fornitori")).toContain("citta");
  expect((await call("PATCH", "/records/fornitori/1", { values: { citta: "Bari" } })).body).toMatchObject({ nome: "Alfa", citta: "Bari" });

  // A table others point to can't be dropped from under them.
  const blocked = await call("DELETE", "/tables/clienti");
  expect(blocked.status).toBe(400);
  expect(blocked.body.error).toMatch(/fornitori/);
  expect(columns((await call("DELETE", "/tables/fornitori")).body, "fornitori")).toBeUndefined();
  expect((await call("POST", "/query", { query: all("fornitori") })).status).toBe(400);
});

test("in chat, Sibilla creates a table, fills it, and can build on it in the same run", async () => {
  const use = (name: string, input: unknown, id: string): Block => ({ type: "tool_use", id, name, input });
  const view: Spec = { title: "Fornitori", variables: [], nodes: [
    { id: "root", parentId: null, type: "table", title: null, rowClick: null, query: { ...all("fornitori"), select: ["nome"] }, columns: [{ field: "nome", label: "Nome", format: "text" }] },
  ] };
  const turns: Block[][] = [
    [use("crea_tabella", { nome: "fornitori", colonne: [{ nome: "nome", tipo: "text", obbligatoria: true }, { nome: "citta", tipo: "text" }] }, "a")],
    [use("inserisci_righe", { tabella: "fornitori", righe: [{ nome: "Alfa", citta: "Bari" }, { citta: "Roma" }] }, "b")], // second row is invalid
    [use("inserisci_righe", { tabella: "fornitori", righe: [{ nome: "Alfa", citta: "Bari" }, { nome: "Beta", citta: "Roma" }] }, "c")],
    [use("mostra_interfaccia", { messaggio: "Ho creato fornitori con 2 righe.", spec: view }, "d")],
  ];
  const seen: string[] = [];
  let n = 0;
  const step: LlmStep = async ({ messages }) => {
    const last = messages.at(-1)!.content;
    if (Array.isArray(last)) for (const b of last as { type: string; content?: unknown }[]) if (b.type === "tool_result") seen.push(String(b.content));
    return { content: turns[n++], stopReason: "tool_use" };
  };
  const app = createApp({ db: openDb(":memory:"), libraries, step });
  const r = await app.request("/api/generate", json("POST", { prompt: "crea la tabella fornitori con due esempi" }));
  expect(r.status).toBe(200);
  expect((await r.json()).message).toBe("Ho creato fornitori con 2 righe.");
  expect(seen[0]).toMatch(/Tabella creata: fornitori: id integer PK, nome text obbligatorio, citta text/);
  expect(seen[1]).toMatch(/Riga 2.*nome/);
  expect(seen[2]).toBe("2 righe inserite in fornitori");
  const rows = await (await app.request("/api/query", json("POST", { query: all("fornitori") }))).json();
  expect(rows.rows).toHaveLength(2);
});
