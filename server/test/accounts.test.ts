import { expect, test } from "vitest";
import type { Spec } from "@sibilla/shared";
import { openDb } from "../src/db";
import { createApp } from "../src/app";
import { KeyStore } from "../src/keys";
import { createInterface, deleteOrphanDocs } from "../src/interfaces";
import { createRecord, deleteRecord, importDocs } from "../src/records";
import { introspect } from "../src/schema";
import { withCollections } from "@sibilla/shared";
import { runQuery } from "../src/query";
import type { LlmStep } from "../src/generate";
import { store } from "./fake-npm";

const step: LlmStep = async () => ({ content: [{ type: "text", text: "ok" }], stopReason: "end_turn" });
const libraries = store().store;
const heading = { id: "root", parentId: null, type: "heading" as const, text: "Ciao", level: 1 as const };
const collections = [
  { name: "progetti", fields: [{ name: "nome", type: "text" as const, required: true, references: null }] },
  { name: "note", fields: [
    { name: "testo", type: "text" as const, required: true, references: null },
    { name: "progetto_id", type: "number" as const, required: false, references: "progetti" },
  ] },
];
const appSpec: Spec = { title: "Note", variables: [], nodes: [heading], appId: "app-1", collections };
const q = (table: string) => ({ table, select: [], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: null });

/** A browser: remembers the session cookie between requests. */
function browser(app: ReturnType<typeof createApp>) {
  let cookie = "";
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await app.request(`/api${path}`, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
  };
}

test("with accounts on: sign-up, login, and conversations private to their owner", async () => {
  const db = openDb(":memory:");
  createInterface(db, { nome: "Di prima degli account", spec: null, prompt: null });
  const app = createApp({ db, step, libraries, auth: true, signup: true });
  const ada = browser(app), bob = browser(app);

  expect((await ada("GET", "/interfaces")).status).toBe(401);
  expect((await ada("GET", "/auth/me")).body).toEqual({ enabled: true, user: null, signup: true });
  expect((await ada("POST", "/auth/register", { email: "ada@example.com", password: "corta" })).status).toBe(400);
  expect((await ada("POST", "/auth/register", { email: "Ada@Example.com", password: "password-lunga" })).status).toBe(201);
  // The first account takes over what existed before.
  expect((await ada("GET", "/interfaces")).body.map((i: { nome: string }) => i.nome)).toEqual(["Di prima degli account"]);

  await bob("POST", "/auth/register", { email: "bob@example.com", password: "password-lunga" });
  const mine = (await bob("POST", "/interfaces", { nome: "Di Bob", spec: null, prompt: null })).body;
  expect((await bob("GET", "/interfaces")).body.map((i: { nome: string }) => i.nome)).toEqual(["Di Bob"]);
  expect((await ada("GET", `/interfaces/${mine.id}`)).status).toBe(404);
  expect((await ada("DELETE", `/interfaces/${mine.id}`)).status).toBe(404);

  await ada("POST", "/auth/logout");
  expect((await ada("GET", "/interfaces")).status).toBe(401);
  expect((await ada("POST", "/auth/login", { email: "ada@example.com", password: "sbagliata" })).status).toBe(400);
  expect((await ada("POST", "/auth/login", { email: "ada@example.com", password: "password-lunga" })).status).toBe(200);
  expect((await ada("GET", "/interfaces")).status).toBe(200);
});

test("sign-up closes after the first account unless opened", async () => {
  const app = createApp({ db: openDb(":memory:"), step, libraries, auth: true });
  expect((await browser(app)("POST", "/auth/register", { email: "a@example.com", password: "password-lunga" })).status).toBe(201);
  const late = await browser(app)("POST", "/auth/register", { email: "b@example.com", password: "password-lunga" });
  expect(late.status).toBe(400);
  expect(late.body.error).toMatch(/chiusa/);
});

test("a public link opens the app and its data, and nothing else", async () => {
  const db = openDb(":memory:");
  const app = createApp({ db, step, libraries, auth: true });
  const ada = browser(app), guest = browser(app);
  await ada("POST", "/auth/register", { email: "ada@example.com", password: "password-lunga" });
  const d = (await ada("POST", "/interfaces", { nome: "Note", spec: appSpec, prompt: null })).body;
  expect(d.shareToken).toBeNull();
  const token = (await ada("PUT", `/interfaces/${d.id}/share`, { shared: true })).body.shareToken as string;
  expect(token.length).toBeGreaterThan(20);

  expect((await guest("GET", `/shared/${token}`)).body).toMatchObject({ nome: "Note", spec: { title: "Note" } });
  expect((await guest("GET", "/shared/boh")).status).toBe(404);
  const link = { "x-sibilla-share": token }, scope = { id: "app-1", collections };
  expect((await guest("POST", "/records/progetti", { values: { nome: "Sito" }, app: scope }, link)).status).toBe(201);
  expect((await guest("POST", "/query", { query: q("progetti"), app: scope }, link)).body.rows).toHaveLength(1);
  expect((await guest("POST", "/query", { query: q("progetti"), app: scope })).status).toBe(401); // no link, no session
  expect((await guest("POST", "/query", { query: q("progetti"), app: { ...scope, id: "altra-app" } }, link)).status).toBe(400);
  expect((await guest("GET", "/interfaces", undefined, link)).status).toBe(401);
  expect((await guest("POST", "/generate", { prompt: "x" }, link)).status).toBe(401);

  await ada("PUT", `/interfaces/${d.id}/share`, { shared: false });
  expect((await guest("GET", `/shared/${token}`)).status).toBe(404);
});

test("pinning and archiving don't count as activity; renaming does", async () => {
  const app = createApp({ db: openDb(":memory:"), step, libraries });
  const me = browser(app);
  const d = (await me("POST", "/interfaces", { nome: "Vista", spec: null, prompt: null })).body;
  expect(d).toMatchObject({ pinned: false, archived: false });
  const pinned = (await me("PATCH", `/interfaces/${d.id}`, { pinned: true, archived: true })).body;
  expect(pinned).toMatchObject({ pinned: true, archived: true, nome: "Vista", updatedAt: d.updatedAt });
});

test("saved API keys are encrypted at rest, and older plain ones get encrypted on first use", () => {
  const db = openDb(":memory:");
  const secret = Buffer.alloc(32, 7);
  const keys = new KeyStore(db, {}, secret);
  keys.set("openai", "sk-segreta-1234");
  const raw = () => (db.prepare("select value from sib_settings where key = 'key.openai'").get() as { value: string }).value;
  expect(raw()).not.toContain("sk-segreta");
  expect(keys.get("openai")).toBe("sk-segreta-1234");
  expect(new KeyStore(db, {}, Buffer.alloc(32, 9)).get("openai")).toBeNull(); // another secret can't read it

  db.prepare("update sib_settings set value = 'sk-vecchia-0000' where key = 'key.openai'").run();
  expect(keys.get("openai")).toBe("sk-vecchia-0000");
  expect(raw()).toMatch(/^v1:/);
});

test("mini app data: import validates, deleting a document empties the fields that pointed to it, orphans are swept", () => {
  const db = openDb(":memory:");
  const schema = withCollections(introspect(db), collections);
  const app = { id: "app-1", collections };
  const rows = (t: string, a = app) => runQuery(db, schema, q(t), {}, a).rows;

  const p = createRecord(db, schema, "progetti", { nome: "Sito" }, app);
  expect(importDocs(db, schema, app, "note", [{ id: 99, testo: "Uno", progetto_id: p.id, creato_il: "x" }, { testo: "Due" }])).toBe(2);
  expect(() => importDocs(db, schema, app, "note", [{ testo: "Ok" }, { progetto_id: p.id }])).toThrow(/Documento 2.*testo/);
  expect(rows("note")).toHaveLength(2); // the failed import left nothing behind

  deleteRecord(db, schema, "progetti", Number(p.id), app);
  expect(rows("note").map((r) => r.progetto_id)).toEqual([null, null]);

  // Documents of an app no conversation holds: removed once old enough, kept while fresh.
  db.prepare("update sib_docs set created_at = '2020-01-01T00:00:00.000Z' where collection = 'note' and json_extract(data, '$.testo') = 'Uno'").run();
  expect(deleteOrphanDocs(db)).toBe(1);
  createInterface(db, { nome: "Note", spec: appSpec, prompt: null });
  db.prepare("update sib_docs set created_at = '2020-01-01T00:00:00.000Z'").run();
  expect(deleteOrphanDocs(db)).toBe(0); // now a conversation holds the app
});
