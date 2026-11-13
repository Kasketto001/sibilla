import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LibraryStore, type Npm } from "../src/libraries";

/** Fake npm: every package exports hello() and ships a CSS file; versions resolve from a table. */
export function fakeNpm(versions: Record<string, string>) {
  const installs: string[] = [];
  const npm: Npm = {
    resolve: async (spec) => {
      const name = spec.startsWith("@") ? "@" + spec.slice(1).split("@")[0] : spec.split("@")[0];
      if (!versions[name]) throw new Error(`404 ${name}`);
      return versions[name];
    },
    install: async (dir, name, version) => {
      installs.push(`${name}@${version}`);
      const pkg = join(dir, "node_modules", name);
      mkdirSync(join(pkg, "button"), { recursive: true });
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ name, version, description: `fake ${name}`, module: "index.js",
        exports: { ".": "./index.js", "./button": "./button/index.js", "./styles.css": "./styles.css" } }));
      writeFileSync(join(pkg, "index.js"), `export const hello = () => "hi from ${name}";`);
      writeFileSync(join(pkg, "button", "index.js"), `export default function Button() { return "btn"; }`);
      writeFileSync(join(pkg, "styles.css"), `.fake-${name.replace(/\W/g, "")} { color: red; }`);
    },
  };
  return { npm, installs };
}

export const store = (versions: Record<string, string> = { "ui-kit": "1.2.3", "@acme/design": "4.0.0" }) => {
  const f = fakeNpm(versions);
  return { ...f, store: new LibraryStore(mkdtempSync(join(tmpdir(), "sib-libs-")), f.npm) };
};

