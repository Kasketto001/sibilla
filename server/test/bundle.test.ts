import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { LibraryStore } from "../src/libraries";
import { fakeNpm, store } from "./fake-npm";
import { buildView } from "../src/bundle";

test("same library and version is installed once and shared", async () => {
  const { store: s, installs } = store();
  const a = await s.ensure("ui-kit@1");
  const b = await s.ensure("ui-kit@^1.2");
  expect(a.dir).toBe(b.dir);
  expect(a.version).toBe("1.2.3");
  expect(installs).toEqual(["ui-kit@1.2.3"]);
});

test("concurrent requests share one install", async () => {
  const { store: s, installs } = store();
  await Promise.all([s.ensure("ui-kit"), s.ensure("ui-kit"), s.ensure("ui-kit@1")]);
  expect(installs).toHaveLength(1);
});

test("different versions live in separate folders", async () => {
  const { store: s } = store();
  const a = await s.ensure("ui-kit");
  const { npm } = fakeNpm({ "ui-kit": "2.0.0" });
  const b = await new LibraryStore(join(a.dir, ".."), npm).ensure("ui-kit@2");
  expect(a.dir).not.toBe(b.dir);
  expect(existsSync(a.dir) && existsSync(b.dir)).toBe(true);
});

test("info lists version, subpaths and css files", async () => {
  const { store: s } = store();
  const info = await s.info("@acme/design");
  expect(info).toMatchObject({ name: "@acme/design", version: "4.0.0", description: "fake @acme/design" });
  expect(info.imports).toEqual(expect.arrayContaining(["@acme/design", "@acme/design/button"]));
  expect(info.css).toContain("@acme/design/styles.css");
});

test("unknown packages and bad names are refused", async () => {
  const { store: s } = store();
  await expect(s.ensure("nonesiste")).rejects.toThrow(/nonesiste/);
  await expect(s.ensure("--registry=http://evil")).rejects.toThrow(/non valido/);
});

test("a view bundles React, the bridge, its libraries and their CSS", async () => {
  const { store: s } = store();
  const r = await buildView({
    source: `import { hello } from "ui-kit"; import Button from "@acme/design/button"; import { useQuery } from "sibilla";
      import "@acme/design/styles.css";
      export default function V() { useQuery({ table: "x" }); return <p>{hello()}<Button /></p>; }`,
    libraries: ["ui-kit@1", "@acme/design"], stylesheets: [],
  }, s);
  if ("error" in r) throw new Error(r.error);
  const out = await r.read();
  expect(out.js).toContain("hi from ui-kit");
  expect(out.js).toContain("useState"); // React bundled in
  expect(out.js).toContain("sibilla");  // bridge messages
  expect(out.css).toContain("fake-acmedesign");
});

test("builds are cached by content", async () => {
  const { store: s } = store();
  const v = { source: `export default () => <b>x</b>`, libraries: ["ui-kit"], stylesheets: [] };
  const a = await buildView(v, s);
  const b = await buildView(v, s);
  expect("hash" in a && "hash" in b && a.hash === b.hash).toBe(true);
});

test("imports of undeclared packages fail the build", async () => {
  const { store: s } = store();
  const r = await buildView({ source: `import x from "lodash"; export default () => x`, libraries: [], stylesheets: [] }, s);
  expect("error" in r && r.error).toMatch(/lodash/);
});

test("syntax errors are reported with position", async () => {
  const { store: s } = store();
  const r = await buildView({ source: `export default () => <div>`, libraries: [], stylesheets: [] }, s);
  expect("error" in r && r.error).toMatch(/riga \d+/);
});

test("versioned paths from views saved in the CDN era still resolve", async () => {
  const { store: s } = store();
  const r = await buildView({
    source: `import { hello } from "ui-kit@1"; export default () => <b>{hello()}</b>`,
    libraries: ["ui-kit@1", "@acme/design@4"], stylesheets: ["@acme/design@4/styles.css"],
  }, s);
  if ("error" in r) throw new Error(r.error);
  expect((await r.read()).css).toContain("fake-acmedesign");
});

test("errors in stylesheets name the stylesheet, not internal temp files", async () => {
  const { store: s } = store();
  const r = await buildView({ source: `export default () => null`, libraries: ["ui-kit"], stylesheets: ["ui-kit/manca.css"] }, s);
  expect("error" in r && r.error).toContain("ui-kit/manca.css");
  expect("error" in r && r.error).not.toMatch(/tmp|entry\.js/);
});
