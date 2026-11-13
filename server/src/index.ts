import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { openDb } from "./db";
import { createApp } from "./app";
import { deleteOrphanDocs } from "./interfaces";
import { KeyStore, loadSecret } from "./keys";
import { LibraryStore } from "./libraries";
import { routerStep } from "./llm";

const db = openDb(process.env.SIBILLA_DB ?? "./sibilla.db");
const keys = new KeyStore(db, process.env, loadSecret());
const orphans = deleteOrphanDocs(db);
if (orphans) console.log(`Rimossi ${orphans} documenti di app mai salvate.`);
if (!keys.status().some((p) => p.configured))
  console.warn("⚠ Nessuna chiave API configurata: aggiungila dall'app («Accesso ai modelli») o in server/.env. Il resto funziona.");

const port = Number(process.env.PORT ?? 8787);
// Accounts are on unless SIBILLA_AUTH=off (a machine only you can reach).
const app = createApp({ db, keys, auth: process.env.SIBILLA_AUTH !== "off", signup: process.env.SIBILLA_SIGNUP === "open", step: routerStep(keys), libraries: new LibraryStore(process.env.SIBILLA_LIBS ?? "./.sibilla-libs") });
// With a built UI (npm run build) this one process serves the whole app; in development Vite serves the UI and proxies /api here.
const dist = resolve(import.meta.dirname, "../../web/dist");
const site = new Hono();
site.route("/", app);
if (existsSync(dist)) {
  const root = relative(process.cwd(), dist) || ".";
  site.use("*", serveStatic({ root }));
  site.get("*", serveStatic({ root, path: "index.html" }));
}
serve({ fetch: site.fetch, port }, () =>
  console.log(existsSync(dist) ? `Sibilla su http://localhost:${port}` : `Sibilla API su http://localhost:${port}`));
