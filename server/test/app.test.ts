import { expect, test } from "vitest";
import type { Spec } from "@sibilla/shared";
import { openDb } from "../src/db";
import { createApp } from "../src/app";
import type { LlmStep } from "../src/generate";
import { store } from "./fake-npm";

const spec: Spec = { title: "T", variables: [], nodes: [{ id: "root", parentId: null, type: "heading", text: "Ciao", level: 1 }] };
const step: LlmStep = async () => ({
  content: [{ type: "tool_use", id: "t1", name: "mostra_interfaccia", input: { messaggio: "Ecco", spec } }], stopReason: "tool_use",
});
const libraries = store().store;
const app = () => createApp({ db: openDb(":memory:"), step, libraries });

const json = (method: string, body?: unknown) => ({
  method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const q = { table: "clienti", select: ["id"], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: 3 };

test("GET /api/schema", async () => {
  const r = await app().request("/api/schema");
  expect(r.status).toBe(200);
  expect((await r.json()).tables.map((t: { name: string }) => t.name)).toContain("clienti");
});

test("POST /api/query", async () => {
  const r = await app().request("/api/query", json("POST", { query: q, vars: {} }));
  expect(r.status).toBe(200);
  expect((await r.json()).rows).toHaveLength(3);
});

test("POST /api/query refuses internal tables", async () => {
  const r = await app().request("/api/query", json("POST", { query: { ...q, table: "sib_versions" }, vars: {} }));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBeTruthy();
});

test("POST /api/query rejects malformed body", async () => {
  expect((await app().request("/api/query", json("POST", { query: { table: 1 } }))).status).toBe(400);
});

test("records create and update", async () => {
  const a = app();
  const c = await a.request("/api/records/clienti", json("POST", { values: { nome: "X", email: "x@y.it", segmento: "PMI" } }));
  expect(c.status).toBe(201);
  const { id } = await c.json();
  const u = await a.request(`/api/records/clienti/${id}`, json("PATCH", { values: { citta: "Lecce" } }));
  expect(u.status).toBe(200);
  expect((await u.json()).citta).toBe("Lecce");
});

test("record field errors are 400 with fieldErrors", async () => {
  const r = await app().request("/api/records/clienti", json("POST", { values: { email: "x@y.it", segmento: "PMI" } }));
  expect(r.status).toBe(400);
  expect((await r.json()).fieldErrors.nome).toBe("Campo obbligatorio");
});

test("POST /api/generate", async () => {
  const r = await app().request("/api/generate", json("POST", { prompt: "ciao", currentSpec: null, history: [] }));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ spec, message: "Ecco" });
});

test("generation failure is 422", async () => {
  const a = createApp({ db: openDb(":memory:"), libraries, step: async () => ({ content: [], stopReason: "refusal" }) });
  expect((await a.request("/api/generate", json("POST", { prompt: "x", currentSpec: null, history: [] }))).status).toBe(422);
});

test("interfaces lifecycle", async () => {
  const a = app();
  const c = await a.request("/api/interfaces", json("POST", { nome: "Vendite", spec, prompt: "p" }));
  expect(c.status).toBe(201);
  const { id } = await c.json();
  expect((await (await a.request("/api/interfaces")).json())).toHaveLength(1);
  const v = await a.request(`/api/interfaces/${id}/versions`, json("POST", { spec, prompt: null }));
  expect((await v.json()).latestVersion).toBe(2);
  expect((await (await a.request(`/api/interfaces/${id}/versions/2`)).json()).spec).toEqual(spec);
  expect((await (await a.request(`/api/interfaces/${id}`, json("PATCH", { nome: "Nuovo" }))).json()).nome).toBe("Nuovo");
  expect((await a.request(`/api/interfaces/${id}`, json("DELETE"))).status).toBe(204);
  expect((await a.request(`/api/interfaces/${id}`)).status).toBe(404);
});

test("deleting a missing interface is 404", async () => {
  expect((await app().request("/api/interfaces/999", json("DELETE"))).status).toBe(404);
});

test("missing version is 404", async () => {
  expect((await app().request("/api/interfaces/999/versions/1")).status).toBe(404);
});

test("invalid spec on save is 400", async () => {
  const bad = { ...spec, nodes: [...spec.nodes, { id: "r2", parentId: null, type: "text", text: "x" }] };
  expect((await app().request("/api/interfaces", json("POST", { nome: "X", spec: bad, prompt: null }))).status).toBe(400);
});

test("provider API errors become a readable 502", async () => {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const a = createApp({ db: openDb(":memory:"), libraries, step: async () => {
    throw new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "invalid x-api-key", new Headers());
  } });
  const r = await a.request("/api/generate", json("POST", { prompt: "x", currentSpec: null, history: [] }));
  expect(r.status).toBe(502);
  expect((await r.json()).error).toMatch(/chiave API non valida/);
});

test("generate accepts attachments and refuses oversized ones", async () => {
  const ok = await app().request("/api/generate", json("POST", {
    prompt: "x", attachments: [{ name: "a.txt", mediaType: "text/plain", data: "ciao" }],
  }));
  expect(ok.status).toBe(200);
  const big = await app().request("/api/generate", json("POST", {
    prompt: "x", attachments: [{ name: "a.png", mediaType: "image/png", data: "A".repeat(26_000_000) }],
  }));
  expect(big.status).toBe(400);
});

test("POST /api/bundle builds a view and serves its files to the sandbox", async () => {
  const a = app();
  const ok = await a.request("/api/bundle", json("POST", { source: `import { hello } from "ui-kit"; export default () => <b>{hello()}</b>`, libraries: ["ui-kit"], stylesheets: ["ui-kit/styles.css"] }));
  expect(ok.status).toBe(200);
  const { hash } = await ok.json();
  const js = await a.request(`/api/bundle/${hash}.js`);
  expect(js.headers.get("content-type")).toContain("javascript");
  expect(js.headers.get("access-control-allow-origin")).toBe("*");
  expect(await js.text()).toContain("hi from ui-kit");
  expect(await (await a.request(`/api/bundle/${hash}.css`)).text()).toContain("fake-uikit");
  expect((await a.request("/api/bundle/../../etc/passwd.js")).status).toBe(404);
  const bad = await a.request("/api/bundle", json("POST", { source: "export default () => <b>", libraries: [], stylesheets: [] }));
  expect(bad.status).toBe(400);
});

test("the Tailwind runtime is served locally", async () => {
  const r = await app().request("/api/runtime/tailwind.js");
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBe("*");
});

test("interface chat history endpoints", async () => {
  const a = app();
  const { id } = await (await a.request("/api/interfaces", json("POST", {
    nome: "V", spec, prompt: "p", messages: [{ role: "user", content: "crea" }, { role: "assistant", content: "ok" }],
  }))).json();
  expect((await a.request(`/api/interfaces/${id}/messages`, json("POST", { messages: [{ role: "user", content: "altro" }] }))).status).toBe(204);
  const msgs = await (await a.request(`/api/interfaces/${id}/messages`)).json();
  expect(msgs.map((m: { content: string }) => m.content)).toEqual(["crea", "ok", "altro"]);
  expect((await a.request("/api/interfaces/999/messages")).status).toBe(404);
  expect((await a.request("/api/interfaces/999/messages", json("POST", { messages: [] }))).status).toBe(404);
});

test("POST /api/generate refuses unknown models and efforts", async () => {
  const bad = await app().request("/api/generate", json("POST", { prompt: "ciao", llm: { model: "gpt-x", effort: "low", thinking: false } }));
  expect(bad.status).toBe(400);
  const ok = await app().request("/api/generate", json("POST", { prompt: "ciao", llm: { model: "claude-haiku-5-5", effort: "max", thinking: true } }));
  expect(ok.status).toBe(200);
});

test("provider access: keys are verified, saved, never returned, and removable", async () => {
  const { KeyStore } = await import("../src/keys");
  const { routerStep } = await import("../src/llm");
  const db = openDb(":memory:");
  const keys = new KeyStore(db, { GEMINI_API_KEY: "env-key-1234" });
  const checked: string[] = [];
  const a = createApp({ db, libraries, keys, step: routerStep(keys), verifyKey: async (p, k) => {
    checked.push(`${p}:${k}`);
    if (k.includes("bad")) throw Object.assign(new Error("nope"), { status: 401 });
  } });

  const status = async (r: Response) => Object.fromEntries((await r.json()).map((p: { id: string; source: string | null; hint: string | null }) => [p.id, [p.source, p.hint]]));
  expect(await status(await a.request("/api/providers"))).toEqual({ anthropic: [null, null], openai: [null, null], google: ["env", "…1234"] });

  const bad = await a.request("/api/providers/openai", json("PUT", { apiKey: "sk-bad-key-0000" }));
  expect(bad.status).toBe(400);
  expect((await bad.json()).error).toMatch(/non valida/);

  const saved = await a.request("/api/providers/openai", json("PUT", { apiKey: "  sk-good-key-9876 " }));
  expect(await status(saved)).toMatchObject({ openai: ["saved", "…9876"] });
  expect(checked).toEqual(["openai:sk-bad-key-0000", "openai:sk-good-key-9876"]);
  expect(JSON.stringify(await (await a.request("/api/providers")).json())).not.toContain("sk-good");

  // A model whose provider has no key fails with a message that says where to add it.
  const noKey = await a.request("/api/generate", json("POST", { prompt: "x" }));
  expect(noKey.status).toBe(422);
  expect((await noKey.json()).error).toMatch(/chiave API di Anthropic/);

  expect(await status(await a.request("/api/providers/openai", json("DELETE")))).toMatchObject({ openai: [null, null] });
  expect((await a.request("/api/providers/boh", json("PUT", { apiKey: "12345678" }))).status).toBe(400);
});

test("a provider error without an HTTP status (mid-stream, e.g. no credit) is still explained", async () => {
  const OpenAI = (await import("openai")).default;
  const a = createApp({ db: openDb(":memory:"), libraries, step: async () => {
    throw new OpenAI.APIError(undefined, { type: "insufficient_quota", code: "credit_balance_exhausted", message: "You have no credits remaining." }, undefined, new Headers());
  } });
  const r = await a.request("/api/generate", json("POST", { prompt: "x" }));
  expect(r.status).toBe(502);
  expect((await r.json()).error).toMatch(/credito esaurito/);
});
