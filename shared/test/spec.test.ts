import { expect, test } from "vitest";
import { SpecSchema, validateSpecTree, specJsonSchema, type Spec } from "../src/index";

const q = (over: object = {}) => ({
  table: "ordini", select: [] as string[], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: null, ...over,
});

const sample: Spec = {
  title: "Ordini",
  variables: [
    { name: "stato", type: "string", default: null },
    { name: "sel", type: "number", default: null },
  ],
  nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    {
      id: "f", parentId: "root", type: "filter", variable: "stato", label: "Stato", input: "select",
      optionsQuery: q({ select: ["stato"], groupBy: ["stato"] }), optionValue: "stato", optionLabel: "stato",
    },
    {
      id: "t", parentId: "root", type: "table", title: null,
      query: q({ select: ["id", "stato"], where: [{ field: "stato", op: "eq", value: "{{stato}}" }], limit: 50 }),
      columns: [{ field: "stato", label: "Stato", format: "badge" }],
      rowClick: { setVariable: "sel", field: "id" },
    },
  ],
} as Spec;

const withNodes = (extra: object[], base = sample.nodes) => ({ ...sample, nodes: [...base, ...extra] }) as Spec;

test("sample spec parses", () => expect(SpecSchema.parse(sample)).toEqual(sample));
test("valid tree has no errors", () => expect(validateSpecTree(sample)).toEqual([]));
test("two roots rejected", () =>
  expect(validateSpecTree(withNodes([{ id: "r2", parentId: null, type: "text", text: "x" }]))).not.toEqual([]));
test("unknown parent rejected", () =>
  expect(validateSpecTree(withNodes([{ id: "x", parentId: "nope", type: "text", text: "x" }]))).not.toEqual([]));
test("duplicate id rejected", () =>
  expect(validateSpecTree(withNodes([{ id: "t", parentId: "root", type: "text", text: "x" }]))).not.toEqual([]));
test("cycle rejected", () =>
  expect(
    validateSpecTree(withNodes([
      { id: "a", parentId: "b", type: "card", title: "a", description: null },
      { id: "b", parentId: "a", type: "card", title: "b", description: null },
    ])),
  ).not.toEqual([]));
test("child under leaf rejected", () =>
  expect(validateSpecTree(withNodes([{ id: "x", parentId: "t", type: "text", text: "x" }]))).not.toEqual([]));
test("tab outside tabs rejected", () =>
  expect(validateSpecTree(withNodes([{ id: "x", parentId: "root", type: "tab", label: "x" }]))).not.toEqual([]));
test("undeclared variable rejected", () => {
  const bad = withNodes([
    { id: "k", parentId: "root", type: "kpi", label: "k", field: "n", format: "number",
      query: q({ where: [{ field: "stato", op: "eq", value: "{{boh}}" }] }) },
  ]);
  expect(validateSpecTree(bad).join(" ")).toContain("boh");
});

test("json schema is non-recursive and closed", () => {
  const schema = specJsonSchema();
  expect(JSON.stringify(schema)).not.toContain('"$ref"');
  const walk = (s: unknown): void => {
    if (Array.isArray(s)) return s.forEach(walk);
    if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      if (o.type === "object") expect(o.additionalProperties).toBe(false);
      Object.values(o).forEach(walk);
    }
  };
  walk(schema);
});

test("join.on tuple becomes an array of strings", () => {
  const s = JSON.stringify(specJsonSchema());
  expect(s).toContain('"on":{"type":"array","items":{"type":"string"}}');
});

test("json schema uses only keywords supported by structured outputs", () => {
  const s = JSON.stringify(specJsonSchema());
  for (const kw of ["oneOf", "prefixItems", "minItems", "maxItems", "minimum", "maximum", "minLength", "maxLength"])
    expect(s).not.toContain(`"${kw}"`);
});

test("optional layout fields parse and old specs without them still parse", () => {
  const withLayout = withNodes([
    { id: "g", parentId: "root", type: "grid", columns: 3 },
    { id: "c", parentId: "g", type: "chart", title: null, kind: "bar", x: "stato", y: ["n"], stacked: true, span: 2,
      query: q({ select: ["stato"], groupBy: ["stato"], aggregates: [{ fn: "count_distinct", field: "id", as: "n" }] }) },
  ]);
  expect(SpecSchema.parse(withLayout)).toEqual(withLayout);
  expect(SpecSchema.parse(sample)).toEqual(sample);
});

test("table accepts pageSize and where accepts the new operators", () => {
  const t = withNodes([{ id: "t2", parentId: "root", type: "table", title: null, rowClick: null, pageSize: 25,
    query: q({ select: ["id"], where: [{ field: "stato", op: "in", value: "a,b" }, { field: "data", op: "is_null", value: null }] }),
    columns: [{ field: "id", label: "N.", format: "number" }] }]);
  expect(SpecSchema.parse(t)).toEqual(t);
});

test("spec style and custom nodes parse", () => {
  const s: Spec = {
    title: "Kanban", variables: [],
    style: { colorScheme: "dark", primary: "#7c3aed", primaryForeground: "#ffffff", background: null, foreground: null,
      palette: ["#7c3aed", "#22d3ee"], radius: "large", font: "serif", density: "compact" },
    nodes: [{ id: "root", parentId: null, type: "custom", source: "export default function V() { return null }",
      libraries: ["antd@5", "@dnd-kit/core"], stylesheets: [], height: null }],
  };
  expect(SpecSchema.parse(s)).toEqual(s);
  expect(validateSpecTree(s)).toEqual([]);
});

test("custom nodes cannot have children", () => {
  const s = { title: "t", variables: [], nodes: [
    { id: "c", parentId: null, type: "custom", source: "x", libraries: [], stylesheets: [], height: null },
    { id: "t", parentId: "c", type: "text", text: "no" },
  ] } as Spec;
  expect(validateSpecTree(s)).not.toEqual([]);
});

test("a model gets the closest effort it accepts", async () => {
  const { effortFor } = await import("../src/llm");
  expect(effortFor("claude-opus-5-5", "max")).toBe("max");
  expect(effortFor("gemini-4-carbon", "max")).toBe("high");
  expect(effortFor("gemini-4-hydrogen", "max")).toBe("xhigh");
  expect(effortFor("gemini-4-argon", "low")).toBe("low");
});

test("a spec still being written shows only its complete, attached nodes", async () => {
  const { partialSpec } = await import("../src/spec");
  const root = { id: "root", parentId: null, type: "stack", direction: "column" };
  const h = { id: "h", parentId: "root", type: "heading", text: "Vendite", level: 1 };
  expect(partialSpec({ title: "Vend" })).toBeNull(); // no nodes yet
  expect(partialSpec({ nodes: [{ id: "root", parentId: null, type: "stack" }] })).toBeNull(); // root not finished
  const p = partialSpec({ title: "Vendite", nodes: [root, h, { id: "k", parentId: "root", type: "kpi", label: "Tot" }, { ...h, id: "x", parentId: "boh" }] });
  expect(p).toMatchObject({ title: "Vendite", variables: [] });
  expect(p!.nodes.map((n) => n.id)).toEqual(["root", "h"]); // unfinished kpi and orphan left out
});

test("routes: screens are kept per route pattern and take their parameters as variables", async () => {
  const { screenSpec, withScreen, isRoute, routeParams, validateSpecTree } = await import("../src/index");
  expect(["/", "/clienti", "/clienti/:id/ordini"].every(isRoute)).toBe(true);
  expect(["clienti", "/Clienti", "/a//b", "/a/:"].some(isRoute)).toBe(false);
  expect(routeParams("/clienti/:id/ordini/:ordine")).toEqual(["id", "ordine"]);

  const h = (text: string) => ({ id: "root", parentId: null, type: "heading" as const, text, level: 1 as const });
  const app = { title: "CRM", variables: [], nodes: [h("Clienti")] };
  const detail = { title: "Scheda cliente", variables: [{ name: "id", type: "number" as const, default: null }], nodes: [h("Scheda")] };
  expect(screenSpec(app, { path: "/clienti/:id", params: { id: 7 } })).toBeNull(); // not generated yet

  const grown = withScreen(app, "/clienti/:id", detail, "Ecco la scheda.");
  expect(grown.nodes).toEqual(app.nodes); // the first screen is untouched
  expect(grown.screens).toEqual([{ path: "/clienti/:id", ...detail, message: "Ecco la scheda." }]);
  // The same screen serves every client: only the parameter changes.
  expect(screenSpec(grown, { path: "/clienti/:id", params: { id: 7 } })).toMatchObject({ title: "Scheda cliente", variables: [{ name: "id", default: 7 }] });
  expect(screenSpec(grown, { path: "/clienti/:id", params: { id: 9 } })!.variables[0].default).toBe(9);
  expect(screenSpec(grown, { path: "/", params: {} })).toEqual(app); // a single screen never carries the others

  // Changing the first screen keeps the generated ones; regenerating a route replaces it.
  expect(withScreen(grown, "/", { ...app, title: "CRM 2" }).screens).toHaveLength(1);
  expect(withScreen(grown, "/clienti/:id", { ...detail, title: "Nuova scheda" }).screens!.map((s) => s.title)).toEqual(["Nuova scheda"]);

  const link = { id: "l", parentId: "root", type: "link" as const, label: "Apri", variant: "button" as const, intent: "scheda" };
  const stack = { id: "root", parentId: null, type: "stack" as const, direction: "column" as const };
  const errors = (l: object) => validateSpecTree({ title: "t", variables: [], nodes: [stack, { ...link, ...l } as never] });
  expect(errors({ to: "/clienti/:id", params: [{ name: "id", value: 3 }] })).toEqual([]);
  expect(errors({ to: "Clienti", params: [] }).join()).toMatch(/rotta non valida/);
  expect(errors({ to: "/clienti/:id", params: [] }).join()).toMatch(/parametro di rotta id/);
  expect(errors({ to: "/clienti/:id", params: [{ name: "id", value: "{{sel}}" }] }).join()).toMatch(/variabile non dichiarata sel/);
});
