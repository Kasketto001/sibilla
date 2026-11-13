import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** npm as the store needs it. Real one shells out; tests pass a fake. */
export type Npm = {
  /** Exact version for a spec like "antd@5" or "antd" (latest). Throws if the package doesn't exist. */
  resolve(spec: string): Promise<string>;
  install(dir: string, name: string, version: string): Promise<void>;
};

export const realNpm: Npm = {
  async resolve(spec) {
    const { stdout } = await run("npm", ["view", spec, "version", "--json"], { timeout: 60_000 });
    const v = JSON.parse(stdout || "null") as string | string[] | null;
    const version = Array.isArray(v) ? v.at(-1) : v;
    if (!version) throw new Error(`nessuna versione trovata per ${spec}`);
    return version;
  },
  async install(dir, name, version) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "sibilla-lib", private: true }));
    // --ignore-scripts: packages chosen by the model never run code on the server; they only get bundled for the sandbox.
    await run("npm", ["install", `${name}@${version}`, "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", "--loglevel=error"],
      { cwd: dir, timeout: 600_000, maxBuffer: 20 * 1024 * 1024 });
  },
};

const NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const RANGE = /^[\w.^~<>=*| -]+$/;

/** "antd@5" → ["antd", "5"], "@mui/material" → ["@mui/material", "latest"]. */
export function splitSpec(spec: string): [string, string] {
  const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
  return at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : [spec, "latest"];
}

export type Library = { name: string; version: string; dir: string };
export type LibraryInfo = Library & { description: string; imports: string[]; css: string[] };

/**
 * Libraries installed on demand, one folder per name@exact-version, shared by every view that uses it.
 * ponytail: no garbage collection of unused versions; add a sweep if disk usage matters.
 */
export class LibraryStore {
  private pending = new Map<string, Promise<Library>>();
  constructor(readonly root: string, private npm: Npm = realNpm) { mkdirSync(root, { recursive: true }); }

  async ensure(spec: string): Promise<Library> {
    const [name, range] = splitSpec(spec.trim());
    if (!NAME.test(name) || !RANGE.test(range)) throw new Error(`nome di libreria non valido: "${spec}"`);
    let version: string;
    try { version = await this.npm.resolve(`${name}@${range}`); }
    catch (e) { throw new Error(`pacchetto npm non trovato: ${name}@${range} (${(e as Error).message.split("\n")[0]})`); }

    const dir = join(this.root, `${name.replace("/", "+")}@${version}`);
    const lib = { name, version, dir };
    if (existsSync(join(dir, ".ready"))) return lib;
    let job = this.pending.get(dir);
    if (!job) {
      job = (async () => {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        try {
          await this.npm.install(dir, name, version);
          writeFileSync(join(dir, ".ready"), new Date().toISOString());
          return lib;
        } catch (e) {
          rmSync(dir, { recursive: true, force: true });
          throw new Error(`installazione di ${name}@${version} fallita: ${(e as Error).message.split("\n").slice(0, 3).join(" ")}`);
        }
      })().finally(() => this.pending.delete(dir));
      this.pending.set(dir, job);
    }
    return job;
  }

  /** What the model needs to write correct imports: version, importable paths, CSS files. */
  async info(spec: string): Promise<LibraryInfo> {
    const lib = await this.ensure(spec);
    const pkgDir = join(lib.dir, "node_modules", lib.name);
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { description?: string; exports?: unknown };
    const imports = new Set([lib.name]);
    if (pkg.exports && typeof pkg.exports === "object")
      for (const k of Object.keys(pkg.exports)) if (k.startsWith("./") && !k.includes("*") && k !== "./package.json") imports.add(`${lib.name}/${k.slice(2)}`);
    // Packages without an exports map (e.g. Cloudscape) are imported by folder: list top-level folders with an index.
    for (const e of readdirSync(pkgDir, { withFileTypes: true }))
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && existsSync(join(pkgDir, e.name, "index.js")))
        imports.add(`${lib.name}/${e.name}`);
    const css: string[] = [];
    const walk = (d: string, depth: number) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(d, e.name);
        if (e.isDirectory() && depth < 2) walk(p, depth + 1);
        else if (e.isFile() && e.name.endsWith(".css")) css.push(`${lib.name}/${relative(pkgDir, p)}`);
      }
    };
    walk(pkgDir, 0);
    return { ...lib, description: pkg.description ?? "", imports: [...imports].sort().slice(0, 150), css: css.slice(0, 30) };
  }
}
