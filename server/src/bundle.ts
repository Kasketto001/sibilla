import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type Message, type Plugin } from "esbuild";
import type { LibraryStore } from "./libraries";

const require = createRequire(import.meta.url);
/** One React for every view, whatever version a library's own node_modules carries. */
const REACT = /^(react|react-dom|scheduler)(\/.*)?$/;
const VERSIONED = /^(@[^/@]+\/)?([^/@.][^/@]*)@[^/]+/;
// Empty dir as resolve base for user code: only declared libraries (nodePaths) can be imported.
const ISOLATED = mkdtempSync(join(tmpdir(), "sibilla-view-"));
const ENTRY = "sibilla-entry.js";

/** Data bridge available to views as `import { useQuery, ... } from "sibilla"`. */
const BRIDGE = `
import { useCallback, useEffect, useState } from "react";
let seq = 0;
const pending = new Map();
addEventListener("message", (e) => {
  const d = e.data;
  if (!d || d.sibilla !== "response" || !pending.has(d.id)) return;
  const p = pending.get(d.id); pending.delete(d.id);
  d.error ? p.reject(new Error(d.error)) : p.resolve(d.result);
});
function call(op, args) {
  return new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    parent.postMessage({ sibilla: "request", id, op, args }, "*");
  });
}
export const query = (q, vars = {}) => call("query", [q, vars]).then((r) => r.rows);
export const createRecord = (table, values) => call("createRecord", [table, values]);
export const updateRecord = (table, id, values) => call("updateRecord", [table, id, values]);
export const deleteRecord = (table, id) => call("deleteRecord", [table, id]);
/** Opens another screen of the app (generated on the spot the first time). */
export const navigate = (to, params = {}, intent = "") => call("navigate", [to, params, intent]);
export function useQuery(q, vars = {}) {
  const key = JSON.stringify([q, vars]);
  const [n, setN] = useState(0);
  const [s, set] = useState({ rows: [], loading: true, error: null });
  useEffect(() => {
    let live = true;
    set((x) => ({ ...x, loading: true }));
    query(q, vars).then(
      (rows) => live && set({ rows, loading: false, error: null }),
      (e) => live && set({ rows: [], loading: false, error: e.message }));
    return () => { live = false; };
  }, [key, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...s, reload };
}
`;

const entry = (stylesheets: string[]) => `
${stylesheets.map((s) => `import ${JSON.stringify(s)};`).join("\n")}
import { createElement, Component } from "react";
import { createRoot } from "react-dom/client";
import View from "sibilla:view";
const report = (message) => parent.postMessage({ sibilla: "error", message: String(message) }, "*");
addEventListener("error", (e) => report(e.message));
addEventListener("unhandledrejection", (e) => report(e.reason?.message ?? e.reason));
new ResizeObserver(() => parent.postMessage({ sibilla: "height", height: document.documentElement.scrollHeight }, "*")).observe(document.body);
class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { report(error.message); }
  render() { return this.state.error ? null : this.props.children; }
}
if (typeof View !== "function") report("Il modulo non esporta un componente di default");
else {
  createRoot(document.getElementById("root")).render(createElement(Boundary, null, createElement(View)));
  window.__sibillaReady = true;
  parent.postMessage({ sibilla: "ready" }, "*");
}
`;

export type ViewSource = { source: string; libraries: string[]; stylesheets: string[] };
export type Built = { hash: string; read: () => Promise<{ js: string; css: string }> };

const fmt = (errors: Message[]) => errors.slice(0, 8).map((e) => {
  const file = e.location?.file ?? "";
  if (!e.location || file.endsWith(ENTRY)) return `stylesheets: ${e.text}`; // the generated entry only imports stylesheets
  const nm = file.lastIndexOf("node_modules/");
  const where = file.includes("sibilla:view") ? "" : ` (${nm >= 0 ? file.slice(nm + "node_modules/".length) : file})`;
  return `riga ${e.location.line}, colonna ${e.location.column}${where}: ${e.text}`;
}).join("; ");

/** Installs the view's libraries (shared store) and bundles everything into one isolated JS + CSS pair, cached by content. */
export async function buildView(v: ViewSource, store: LibraryStore): Promise<Built | { error: string }> {
  let libs;
  try { libs = await Promise.all(v.libraries.map((l) => store.ensure(l))); }
  catch (e) { return { error: (e as Error).message }; }

  const hash = createHash("sha256")
    .update(JSON.stringify({ v: 1, source: v.source, libs: libs.map((l) => `${l.name}@${l.version}`).sort(), css: v.stylesheets, BRIDGE }))
    .digest("hex").slice(0, 32);
  const dir = join(store.root, "_bundles");
  const js = join(dir, `${hash}.js`), css = join(dir, `${hash}.css`);
  const read = async () => ({ js: readFileSync(js, "utf8"), css: existsSync(css) ? readFileSync(css, "utf8") : "" });
  if (existsSync(js)) return { hash, read };

  const virtual: Plugin = {
    name: "sibilla",
    setup(b) {
      b.onResolve({ filter: REACT }, (a) => ({ path: require.resolve(a.path) }));
      // "pkg@2/x.css", "@scope/pkg@1": versions belong in "libraries", not in import paths (views saved for the old CDN
      // runtime used them). The installed folder already pins the version, so resolve the path without it.
      b.onResolve({ filter: VERSIONED }, (a) =>
        b.resolve(a.path.replace(VERSIONED, "$1$2"), { resolveDir: a.resolveDir, kind: a.kind, importer: a.importer }));
      b.onResolve({ filter: /^sibilla(:view)?$/ }, (a) => ({ path: a.path, namespace: "sibilla" }));
      b.onLoad({ filter: /.*/, namespace: "sibilla" }, (a) =>
        a.path === "sibilla:view"
          ? { contents: v.source, loader: "jsx", resolveDir: ISOLATED }
          : { contents: BRIDGE, loader: "js", resolveDir: ISOLATED });
    },
  };

  try {
    const r = await build({
      stdin: { contents: entry(v.stylesheets), loader: "js", resolveDir: ISOLATED, sourcefile: ENTRY },
      bundle: true, write: false, format: "esm", platform: "browser", target: "es2020", minify: true,
      jsx: "automatic", outdir: "out", logLevel: "silent",
      nodePaths: libs.map((l) => join(l.dir, "node_modules")),
      define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
      loader: { ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl", ".eot": "dataurl", ".svg": "dataurl",
        ".png": "dataurl", ".jpg": "dataurl", ".gif": "dataurl", ".webp": "dataurl" },
      plugins: [virtual],
    });
    mkdirSync(dir, { recursive: true });
    for (const f of r.outputFiles) writeFileSync(f.path.endsWith(".css") ? css : js, f.text);
    return { hash, read };
  } catch (e) {
    const errors = (e as { errors?: Message[] }).errors;
    return { error: errors?.length ? fmt(errors) : (e as Error).message };
  }
}
