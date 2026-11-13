import { expect, test } from "vitest";
import type { Spec } from "@sibilla/shared";
import { customProblems } from "../src/custom";
import { store } from "./fake-npm";

const custom = (source: string, libraries: string[] = [], stylesheets: string[] = []): Spec => ({
  title: "t", variables: [],
  nodes: [{ id: "c", parentId: null, type: "custom", source, libraries, stylesheets, height: null }],
});

test("valid custom view with a declared library has no problems", async () => {
  const src = `import { hello } from "ui-kit"; import { useQuery } from "sibilla"; import { useState } from "react";
    export default function V() { const [n] = useState(0); return <b>{hello()}{n}</b> }`;
  expect(await customProblems(custom(src, ["ui-kit@1"]), store().store)).toEqual([]);
});

test("build problems are reported per node", async () => {
  const p = (await customProblems(custom(`import x from "lodash"; export default () => x`), store().store)).join(" ");
  expect(p).toMatch(/^c: .*lodash/);
});

test("missing default export is a problem", async () => {
  expect((await customProblems(custom(`export function V() { return null }`), store().store)).join(" ")).toContain("export default");
});

test("unknown libraries are problems", async () => {
  expect((await customProblems(custom(`export default () => null`, ["nonesiste"]), store().store)).join(" ")).toContain("nonesiste");
});

test("unsafe style colors are problems", async () => {
  const s: Spec = { ...custom("export default () => null"), style: { primary: "red; background: url(x)" } };
  expect((await customProblems(s, store().store)).join(" ")).toContain("primary");
  const ok: Spec = { ...custom("export default () => null"), style: { primary: "#7c3aed", background: "rgb(10 10 10)" } };
  expect(await customProblems(ok, store().store)).toEqual([]);
});
