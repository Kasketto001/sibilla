import type { DatabaseSync } from "node:sqlite";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GoogleApiError } from "@google/genai";
import OpenAI from "openai";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { stream } from "hono/streaming";
import { z } from "zod";
import { isRoute, AppScopeSchema, DEFAULT_LLM, EFFORT_IDS, MODEL_IDS, PROVIDER_IDS, QuerySchema, ScalarSchema, SpecSchema, collectionProblems, withCollections, type AppScope } from "@sibilla/shared";
import { introspect } from "./schema";
import { ColumnDefSchema, RowsSchema, TableDefSchema, addColumn, createTable, dropTable, insertRows } from "./tables";
import { QueryError, runQuery } from "./query";
import { RecordError, clearDocs, createRecord, deleteRecord, importDocs, seedDocs, updateRecord } from "./records";
import { GenerateError, generate, type LlmStep } from "./generate";
import * as ifc from "./interfaces";
import { AuthError, SESSION_DAYS, closeSession, login, openSession, register, sessionUser, userCount, type User } from "./auth";
import { buildView } from "./bundle";
import type { LibraryStore } from "./libraries";
import { KeyStore } from "./keys";
import { verifyKey as realVerify, type VerifyKey } from "./llm";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

class BadRequest extends Error {}

const MAX_ATTACHMENTS = 25_000_000; // base64 chars, ~18 MB of files

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]), content: z.string(), attachments: z.array(z.string()).optional(),
  thinking: z.string().optional(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), cost: z.number().nullable() }).optional(),
});

const Bodies = {
  query: z.object({ query: QuerySchema, vars: z.record(z.string(), ScalarSchema).default({}), app: AppScopeSchema.optional() }),
  record: z.object({ values: z.record(z.string(), ScalarSchema), app: AppScopeSchema.optional() }),
  deleteRecord: z.object({ app: AppScopeSchema.optional() }),
  generate: z.object({
    prompt: z.string().min(1),
    currentSpec: SpecSchema.nullable().default(null),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
    attachments: z.array(z.object({ name: z.string(), mediaType: z.string(), data: z.string() })).default([])
      .refine((a) => a.reduce((n, x) => n + x.data.length, 0) <= MAX_ATTACHMENTS, "allegati troppo grandi (massimo ~18 MB in totale)"),
    mode: z.enum(["classic", "procedural"]).default("classic"),
    navigate: z.object({
      from: z.string(), to: z.string().refine(isRoute, "rotta non valida"), label: z.string(), intent: z.string(),
      params: z.record(z.string(), ScalarSchema), routes: z.array(z.object({ path: z.string(), title: z.string() })).default([]),
    }).optional(),
    llm: z.object({
      model: z.enum(MODEL_IDS).default(DEFAULT_LLM.model), effort: z.enum(EFFORT_IDS).default(DEFAULT_LLM.effort),
      thinking: z.boolean().default(DEFAULT_LLM.thinking),
    }).default(DEFAULT_LLM),
  }),
  createInterface: z.object({
    nome: z.string().min(1), descrizione: z.string().nullable().optional(), spec: SpecSchema.nullable().default(null),
    prompt: z.string().nullable().default(null), messages: z.array(ChatMessageSchema).default([]),
  }),
  messages: z.object({ messages: z.array(ChatMessageSchema) }),
  version: z.object({ spec: SpecSchema, prompt: z.string().nullable().default(null) }),
  update: z.object({
    nome: z.string().min(1).optional(), descrizione: z.string().nullable().optional(), pinned: z.boolean().optional(), archived: z.boolean().optional(),
  }),
  importDocs: z.object({ app: AppScopeSchema, documents: z.array(z.record(z.string(), ScalarSchema)).max(5000) }),
  clearDocs: z.object({ app: AppScopeSchema }),
};

async function body<T extends z.ZodType>(c: { req: { json: () => Promise<unknown> } }, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => { throw new BadRequest("JSON non valido"); });
  const r = schema.safeParse(raw);
  if (!r.success) throw new BadRequest(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

const intParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new BadRequest(`id non valido: ${v}`);
  return n;
};

const COOKIE = "sibilla_session";
/** Header a public app link sends with its data requests instead of a session. */
const SHARE_HEADER = "x-sibilla-share";
/** What someone holding only a public link may call: read and write the app's data, and load custom views. */
const SHARED_ROUTES = /^\/api\/(query|records\/[^/]+(\/\d+)?|bundle)$/;
/** Reachable without an account. */
const PUBLIC_ROUTES = /^\/api\/(auth\/.*|shared\/[^/]+|bundle\/[^/]+|runtime\/.*)$/;

/**
 * `auth`: require an account (each user sees their own conversations). Off by default for tests and single-user setups.
 * `signup`: let anyone create an account; when false only the very first account can be created.
 */
export function createApp({ db, step, libraries, keys = new KeyStore(db), verifyKey = realVerify, auth = false, signup = false }: {
  db: DatabaseSync; step: LlmStep; libraries: LibraryStore; keys?: KeyStore; verifyKey?: VerifyKey; auth?: boolean; signup?: boolean;
}) {
  // Read again whenever tables are created, changed or dropped (from the database screen or by Sibilla in chat).
  let schema = introspect(db);
  const app = new Hono<{ Variables: { user: User | null; sharedApp?: string | null } }>().basePath("/api");
  const notFound = { error: "Non trovato" };
  /** The schema one app works on: the database plus its own collections, whose definitions come with the request. */
  /** A public link only reaches the data of the app it was made for. */
  const viaLink = (c: { get: (k: "sharedApp") => string | null | undefined }, a?: AppScope) => {
    const allowed = c.get("sharedApp");
    if (allowed !== undefined && a && a.id !== allowed) throw new BadRequest("Questo link non dà accesso a questi dati");
    return a;
  };
  const scoped = (a?: AppScope) => {
    const problems = collectionProblems(a?.collections, schema);
    if (problems.length) throw new BadRequest(problems.join("; "));
    return { schema: withCollections(schema, a?.collections), app: a };
  };

  /** What the client is told about a failure, and with which HTTP status. */
  const failure = (err: unknown): { status: 400 | 422 | 500 | 502; body: { error: string; fieldErrors?: Record<string, string> } } => {
    if (err instanceof RecordError) return { status: 400, body: { error: err.message, fieldErrors: err.fieldErrors } };
    if (err instanceof BadRequest || err instanceof QueryError || err instanceof ifc.InvalidSpecError || err instanceof AuthError) return { status: 400, body: { error: err.message } };
    if (err instanceof GenerateError) return { status: 422, body: { error: err.message } };
    console.error(err);
    // Errors from the providers' SDKs. They usually carry the HTTP status, but one that arrives mid-stream may not.
    if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError || err instanceof GoogleApiError) {
      const status = (err as { status?: number }).status;
      const code = `${(err as { code?: unknown }).code ?? ""} ${(err as { type?: unknown }).type ?? ""}`;
      const why = /quota|credit|billing/i.test(code) ? "credito esaurito o non attivo sull'account di questo fornitore: aggiungi credito e riprova"
        : status === 401 || status === 403 ? "chiave API non valida o senza accesso a questo modello"
        : status === 429 ? "troppe richieste, riprova tra poco"
        : status === 529 || status === 503 ? "servizio sovraccarico, riprova tra poco" : err.message;
      return { status: 502, body: { error: `Errore nel contattare il modello: ${why}` } };
    }
    return { status: 500, body: { error: "Errore interno" } };
  };
  app.onError((err, c) => { const f = failure(err); return c.json(f.body, f.status); });

  // Accounts. With auth on, everything else needs a session, except what a public app link is allowed to do.
  app.use("*", async (c, next) => {
    const user = auth ? sessionUser(db, getCookie(c, COOKIE)) : null;
    c.set("user", user);
    if (!auth || user || PUBLIC_ROUTES.test(c.req.path)) return next();
    const token = c.req.header(SHARE_HEADER);
    const shared = token && SHARED_ROUTES.test(c.req.path) ? ifc.getShared(db, token) : null;
    if (shared) { c.set("sharedApp", shared.spec.appId ?? null); return next(); }
    return c.json({ error: "Accedi per continuare" }, 401);
  });
  const owner = (c: { get: (k: "user") => User | null }): ifc.Owner => (auth ? c.get("user")!.id : null);
  const canSignUp = () => signup || userCount(db) === 0;
  const startSession = (c: Parameters<typeof setCookie>[0], user: User) => {
    setCookie(c, COOKIE, openSession(db, user.id), { httpOnly: true, sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86_400 });
    return user;
  };
  const Credentials = z.object({ email: z.string().trim().email("email non valida"), password: z.string().min(8, "almeno 8 caratteri").max(200) });
  app.get("/auth/me", (c) => c.json({ enabled: auth, user: c.get("user"), signup: auth && canSignUp() }));
  app.post("/auth/register", async (c) => {
    if (!auth || !canSignUp()) throw new BadRequest("La registrazione è chiusa");
    const { email, password } = await body(c, Credentials);
    return c.json({ user: startSession(c, register(db, email, password)) }, 201);
  });
  app.post("/auth/login", async (c) => {
    const { email, password } = await body(c, Credentials.extend({ password: z.string() }));
    return c.json({ user: startSession(c, login(db, email, password)) });
  });
  app.post("/auth/logout", (c) => {
    const token = getCookie(c, COOKIE);
    if (token) closeSession(db, token);
    deleteCookie(c, COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  // A public link to a conversation's app: anyone with the token can open and use the app, nothing else.
  app.get("/shared/:token", (c) => {
    const s = ifc.getShared(db, c.req.param("token"));
    return s ? c.json(s) : c.json(notFound, 404);
  });
  app.put("/interfaces/:id/share", async (c) => {
    const { shared } = await body(c, z.object({ shared: z.boolean() }));
    const d = ifc.setShared(db, intParam(c.req.param("id")), shared, owner(c));
    return d ? c.json(d) : c.json(notFound, 404);
  });

  app.get("/schema", (c) => c.json(schema));

  app.post("/query", async (c) => {
    const { query, vars, app: a } = await body(c, Bodies.query);
    viaLink(c, a);
    return c.json(runQuery(db, scoped(a).schema, query, vars, a));
  });

  app.post("/records/:table", async (c) => {
    const { values, app: a } = await body(c, Bodies.record);
    viaLink(c, a);
    return c.json(createRecord(db, scoped(a).schema, c.req.param("table"), values, a), 201);
  });
  app.patch("/records/:table/:id", async (c) => {
    const { values, app: a } = await body(c, Bodies.record);
    viaLink(c, a);
    return c.json(updateRecord(db, scoped(a).schema, c.req.param("table"), intParam(c.req.param("id")), values, a));
  });
  app.delete("/records/:table/:id", async (c) => {
    const { app: a } = await body(c, Bodies.deleteRecord);
    viaLink(c, a);
    deleteRecord(db, scoped(a).schema, c.req.param("table"), intParam(c.req.param("id")), a);
    return c.body(null, 204);
  });

  const generateDeps = () => ({
    schema, step, libraries,
    tables: {
      create: (def: unknown) => (schema = createTable(db, schema, TableDefSchema.parse(def))),
      insert: (table: string, rows: unknown) => insertRows(db, schema, table, RowsSchema.parse(rows)),
    },
    query: (q: Parameters<typeof runQuery>[2], a: AppScope) => runQuery(db, scoped(a).schema, q, {}, a).rows,
    seed: (a: AppScope, items: Parameters<typeof seedDocs>[3]) => seedDocs(db, scoped(a).schema, a, items),
  });

  // The database itself: tables can be created, extended and dropped; their rows go through /records like any other.
  app.post("/tables", async (c) => c.json((schema = createTable(db, schema, await body(c, TableDefSchema))), 201));
  app.post("/tables/:name/columns", async (c) => c.json((schema = addColumn(db, schema, c.req.param("name"), await body(c, ColumnDefSchema))), 201));
  app.delete("/tables/:name", (c) => c.json((schema = dropTable(db, schema, c.req.param("name")))));
  app.post("/tables/:name/rows", async (c) => {
    const { rows } = await body(c, z.object({ rows: RowsSchema }));
    return c.json({ inserted: insertRows(db, schema, c.req.param("name"), rows) }, 201);
  });
  // Managing a mini webapp's own data in bulk.
  app.post("/data/:collection/import", async (c) => {
    const { app: a, documents } = await body(c, Bodies.importDocs);
    return c.json({ imported: importDocs(db, scoped(a).schema, a, c.req.param("collection"), documents) }, 201);
  });
  app.delete("/data/:collection", async (c) => {
    const { app: a } = await body(c, Bodies.clearDocs);
    scoped(a);
    return c.json({ deleted: clearDocs(db, a, c.req.param("collection")) });
  });

  app.post("/generate", async (c) => c.json(await generate(await body(c, Bodies.generate), generateDeps())));
  // Same run, reported live: one JSON object per line — progress events, then a final "result" or "error".
  app.post("/generate/stream", async (c) => {
    const input = await body(c, Bodies.generate);
    c.header("content-type", "application/x-ndjson; charset=utf-8");
    c.header("cache-control", "no-cache");
    return stream(c, async (s) => {
      // Writes are queued in order; a client that went away must not fail the run.
      let queue = Promise.resolve();
      const send = (o: unknown) => { queue = queue.then(() => s.write(JSON.stringify(o) + "\n")).then(() => {}, () => {}); };
      // The user pressing "stop" (or closing the page) closes the connection: cancel the provider call too.
      const stop = new AbortController();
      s.onAbort(() => stop.abort());
      try { send({ type: "result", result: await generate(input, generateDeps(), send, stop.signal) }); }
      catch (e) { if (!stop.signal.aborted) { const f = failure(e); send({ type: "error", status: f.status, ...f.body }); } }
      await queue;
    });
  });

  // Custom views: bundle on demand (libraries installed server-side), then the sandbox loads the files by hash.
  // The sandbox has an opaque origin, so these responses need CORS.
  const sandboxFile = (body: string, type: string) =>
    new Response(body, { headers: { "content-type": type, "access-control-allow-origin": "*", "cache-control": "public, max-age=31536000, immutable" } });
  app.post("/bundle", async (c) => {
    const v = await body(c, z.object({ source: z.string(), libraries: z.array(z.string()).default([]), stylesheets: z.array(z.string()).default([]) }));
    const r = await buildView(v, libraries);
    return "error" in r ? c.json({ error: r.error }, 400) : c.json({ hash: r.hash });
  });
  app.get("/bundle/:file", (c) => {
    const m = /^([0-9a-f]{32})\.(js|css)$/.exec(c.req.param("file"));
    const path = m && join(libraries.root, "_bundles", `${m[1]}.${m[2]}`);
    if (!m || !path || !existsSync(path)) return m?.[2] === "css" ? sandboxFile("", "text/css") : c.json(notFound, 404);
    return sandboxFile(readFileSync(path, "utf8"), m[2] === "js" ? "text/javascript" : "text/css");
  });
  const tailwind = readFileSync(createRequire(import.meta.url).resolve("@tailwindcss/browser"), "utf8");
  app.get("/runtime/tailwind.js", () => sandboxFile(tailwind, "text/javascript"));


  // Access to the model providers: which ones have a key, and saving or removing one. Keys are never sent back.
  const provider = (v: string) => {
    const r = z.enum(PROVIDER_IDS).safeParse(v);
    if (!r.success) throw new BadRequest(`Provider sconosciuto: ${v}`);
    return r.data;
  };
  app.get("/providers", (c) => c.json(keys.status()));
  app.put("/providers/:id", async (c) => {
    const id = provider(c.req.param("id"));
    const { apiKey } = await body(c, z.object({ apiKey: z.string().trim().min(8, "chiave troppo corta").max(500) }));
    try { await verifyKey(id, apiKey); }
    catch (e) {
      const status = (e as { status?: number }).status;
      throw new BadRequest(status === 401 || status === 403 ? "Chiave non valida o non autorizzata" : `Non sono riuscita a verificare la chiave: ${(e as Error).message}`);
    }
    keys.set(id, apiKey);
    return c.json(keys.status());
  });
  app.delete("/providers/:id", (c) => { keys.remove(provider(c.req.param("id"))); return c.json(keys.status()); });

  app.get("/interfaces", (c) => c.json(ifc.listInterfaces(db, owner(c))));
  app.post("/interfaces", async (c) => c.json(ifc.createInterface(db, await body(c, Bodies.createInterface), owner(c)), 201));
  app.get("/interfaces/:id", (c) => {
    const d = ifc.getInterface(db, intParam(c.req.param("id")), owner(c));
    return d ? c.json(d) : c.json(notFound, 404);
  });
  app.patch("/interfaces/:id", async (c) => {
    const d = ifc.updateInterface(db, intParam(c.req.param("id")), await body(c, Bodies.update), owner(c));
    return d ? c.json(d) : c.json(notFound, 404);
  });
  app.delete("/interfaces/:id", (c) =>
    ifc.deleteInterface(db, intParam(c.req.param("id")), owner(c)) ? c.body(null, 204) : c.json(notFound, 404));
  app.get("/interfaces/:id/messages", (c) => {
    const m = ifc.listMessages(db, intParam(c.req.param("id")), owner(c));
    return m ? c.json(m) : c.json(notFound, 404);
  });
  app.post("/interfaces/:id/messages", async (c) => {
    const { messages } = await body(c, Bodies.messages);
    return ifc.appendMessages(db, intParam(c.req.param("id")), messages, owner(c)) ? c.body(null, 204) : c.json(notFound, 404);
  });
  app.get("/interfaces/:id/versions/:n", (c) => {
    const v = ifc.getVersion(db, intParam(c.req.param("id")), intParam(c.req.param("n")), owner(c));
    return v ? c.json(v) : c.json(notFound, 404);
  });
  app.post("/interfaces/:id/versions", async (c) => {
    const d = ifc.addVersion(db, intParam(c.req.param("id")), await body(c, Bodies.version), owner(c));
    return d ? c.json(d, 201) : c.json(notFound, 404);
  });

  return app;
}
