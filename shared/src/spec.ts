import { z } from "zod";
import { CollectionSchema } from "./collections";
import { isRoute, routeParams } from "./routes";

export const ScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type Scalar = z.infer<typeof ScalarSchema>;

const o = z.strictObject;

export const QuerySchema = o({
  table: z.string(),
  select: z.array(z.string()),
  join: z.array(o({ table: z.string(), on: z.tuple([z.string(), z.string()]) })),
  where: z.array(o({
    field: z.string(),
    op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "in", "is_null", "not_null"]),
    value: ScalarSchema,
  })),
  groupBy: z.array(z.string()),
  aggregates: z.array(o({ fn: z.enum(["count", "count_distinct", "sum", "avg", "min", "max"]), field: z.string(), as: z.string() })),
  orderBy: z.array(o({ field: z.string(), dir: z.enum(["asc", "desc"]) })),
  limit: z.number().int().nullable(),
});
export type Query = z.infer<typeof QuerySchema>;

// span/pageSize/stacked are optional so specs saved before they existed still parse.
const base = { id: z.string(), parentId: z.string().nullable(), span: z.number().int().nullable().optional() };
// choices: a fixed list of values for a select, instead of an optionsQuery.
const options = {
  optionsQuery: QuerySchema.nullable(), optionValue: z.string().nullable(), optionLabel: z.string().nullable(),
  choices: z.array(z.string()).nullable().optional(),
};

/** Where an interaction leads: a route of the app ("/clienti/:id") and, for when that screen doesn't exist yet, what it should show. */
const nav = { to: z.string(), intent: z.string() };

export const NodeSchema = z.discriminatedUnion("type", [
  o({ ...base, type: z.literal("stack"), direction: z.enum(["row", "column"]) }),
  o({ ...base, type: z.literal("grid"), columns: z.number().int() }),
  o({ ...base, type: z.literal("card"), title: z.string(), description: z.string().nullable() }),
  o({ ...base, type: z.literal("heading"), text: z.string(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  o({ ...base, type: z.literal("text"), text: z.string() }),
  o({ ...base, type: z.literal("kpi"), label: z.string(), query: QuerySchema, field: z.string(), format: z.enum(["number", "currency", "percent"]) }),
  o({
    ...base, type: z.literal("table"), title: z.string().nullable(), query: QuerySchema,
    columns: z.array(o({ field: z.string(), label: z.string(), format: z.enum(["text", "number", "currency", "date", "badge"]) })),
    rowClick: o({ setVariable: z.string(), field: z.string() }).nullable(),
    pageSize: z.number().int().nullable().optional(),
    /** Clicking a row opens another screen; each route parameter takes its value from a field of the row. */
    rowLink: o({ ...nav, params: z.array(o({ name: z.string(), field: z.string() })) }).nullable().optional(),
  }),
  // Opens another screen of the app. Route parameters take a literal value or a variable ("{{nome}}").
  o({ ...base, type: z.literal("link"), label: z.string(), variant: z.enum(["button", "link"]), ...nav, params: z.array(o({ name: z.string(), value: ScalarSchema })) }),
  o({ ...base, type: z.literal("chart"), title: z.string().nullable(), kind: z.enum(["bar", "line", "area", "pie"]), query: QuerySchema, x: z.string(), y: z.array(z.string()), stacked: z.boolean().nullable().optional() }),
  o({ ...base, type: z.literal("filter"), variable: z.string(), label: z.string(), input: z.enum(["select", "search", "date"]), ...options }),
  o({ ...base, type: z.literal("tabs") }),
  o({ ...base, type: z.literal("tab"), label: z.string() }),
  o({ ...base, type: z.literal("dialog"), title: z.string(), triggerLabel: z.string().nullable(), openVariable: z.string().nullable() }),
  o({
    ...base, type: z.literal("form"), table: z.string(), mode: z.enum(["create", "edit"]),
    recordIdVariable: z.string().nullable(), submitLabel: z.string(),
    /** Edit mode only: also offer to delete the record. */
    allowDelete: z.boolean().nullable().optional(),
    fields: z.array(o({
      column: z.string(), label: z.string(),
      input: z.enum(["text", "textarea", "number", "date", "select", "switch"]), ...options,
    })),
  }),
  // Free-form view: a React module run in a sandboxed iframe; may import npm libraries (served by esm.sh).
  o({
    ...base, type: z.literal("custom"), source: z.string(),
    libraries: z.array(z.string()), stylesheets: z.array(z.string()), height: z.number().int().nullable(),
  }),
]);
export type Node = z.infer<typeof NodeSchema>;
export type NodeOf<T extends Node["type"]> = Extract<Node, { type: T }>;

const color = z.string().nullable().optional();
/** Visual overrides of the Sibilla theme for one view. Everything optional: absent = brand default. */
export const StyleSchema = o({
  colorScheme: z.enum(["light", "dark"]).nullable().optional(),
  primary: color, primaryForeground: color, background: color, foreground: color,
  palette: z.array(z.string()).nullable().optional(),
  radius: z.enum(["none", "small", "medium", "large"]).nullable().optional(),
  font: z.enum(["sans", "serif", "mono", "rounded"]).nullable().optional(),
  density: z.enum(["compact", "normal", "comfortable"]).nullable().optional(),
});
export type SpecStyle = z.infer<typeof StyleSchema>;

const VariablesSchema = z.array(o({ name: z.string(), type: z.enum(["string", "number", "date"]), default: z.union([z.string(), z.number(), z.null()]) }));

/**
 * A screen of the app other than the first, reached by a route. Screens are generated the first time someone gets there
 * and kept: one screen per route pattern ("/clienti/:id" serves every client), its parameters arriving as variables.
 */
export const ScreenSchema = o({
  path: z.string(), title: z.string(), variables: VariablesSchema, nodes: z.array(NodeSchema),
  /** What Sibilla said when it built the screen. */
  message: z.string().nullable().optional(),
});
export type Screen = z.infer<typeof ScreenSchema>;

export const SpecSchema = o({
  title: z.string(),
  style: StyleSchema.nullable().optional(),
  /** The mini webapp's own data: document collections, stored per appId. Assigned by the server, never by the model. */
  appId: z.string().nullable().optional(),
  collections: z.array(CollectionSchema).nullable().optional(),
  /** Procedural app: starts as one screen whose links lead to screens generated on demand. Set by the server. */
  procedural: z.boolean().nullable().optional(),
  screens: z.array(ScreenSchema).nullable().optional(),
  variables: VariablesSchema,
  nodes: z.array(NodeSchema),
});
export type Spec = z.infer<typeof SpecSchema>;

export const LEAF_TYPES = new Set<Node["type"]>(["heading", "text", "kpi", "table", "chart", "filter", "form", "custom", "link"]);

/** All structured queries a node carries (data query + option lists). */
export function nodeQueries(n: Node): Query[] {
  const qs: (Query | null)[] = [];
  if ("query" in n) qs.push(n.query);
  if (n.type === "filter") qs.push(n.optionsQuery);
  if (n.type === "form") n.fields.forEach((f) => qs.push(f.optionsQuery));
  return qs.filter((q): q is Query => q !== null);
}

const DATE_FN = /^(year|month|day)\((.+)\)$/;
/** Parses "month(data)" → { fn: "month", field: "data" }; plain fields → null. */
export const dateFn = (field: string) => {
  const m = DATE_FN.exec(field);
  return m ? { fn: m[1] as "year" | "month" | "day", field: m[2] } : null;
};
/** Column name a select field yields: "clienti.nome" → "nome", "month(data)" → "month_data". */
export function outputName(field: string): string {
  const d = dateFn(field);
  return d ? `${d.fn}_${d.field.split(".").pop()}` : field.split(".").pop()!;
}

const VAR_RE = /^\{\{(\w+)\}\}$/;
export const varName = (v: unknown) => (typeof v === "string" ? VAR_RE.exec(v)?.[1] ?? null : null);

export function validateSpecTree(spec: Spec): string[] {
  const errors: string[] = [];
  const byId = new Map<string, Node>();
  for (const n of spec.nodes) {
    if (byId.has(n.id)) errors.push(`id duplicato: ${n.id}`);
    byId.set(n.id, n);
  }
  const roots = spec.nodes.filter((n) => n.parentId === null);
  if (roots.length !== 1) errors.push(`serve esattamente un nodo radice, trovati ${roots.length}`);

  for (const n of spec.nodes) {
    if (n.parentId === null) {
      if (n.type === "tab") errors.push(`${n.id}: un tab deve stare dentro un tabs`);
      continue;
    }
    const parent = byId.get(n.parentId);
    if (!parent) { errors.push(`${n.id}: parentId inesistente ${n.parentId}`); continue; }
    if (LEAF_TYPES.has(parent.type)) errors.push(`${n.id}: ${parent.type} (${parent.id}) non può avere figli`);
    if (parent.type === "tabs" && n.type !== "tab") errors.push(`${n.id}: i figli di tabs devono essere tab`);
    if (n.type === "tab" && parent.type !== "tabs") errors.push(`${n.id}: un tab deve stare dentro un tabs`);
  }

  for (const n of spec.nodes) {
    const seen = new Set<string>();
    let cur: Node | undefined = n;
    while (cur && cur.parentId !== null) {
      if (seen.has(cur.id)) { errors.push(`ciclo che coinvolge ${n.id}`); break; }
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
  }

  const declared = new Set(spec.variables.map((v) => v.name));
  const need = (name: string | null, where: string) => {
    if (name !== null && !declared.has(name)) errors.push(`${where}: variabile non dichiarata ${name}`);
  };
  for (const n of spec.nodes) {
    for (const q of nodeQueries(n)) for (const w of q.where) need(varName(w.value), n.id);
    if (n.type === "table" && n.rowClick) need(n.rowClick.setVariable, n.id);
    if (n.type === "dialog") need(n.openVariable, n.id);
    if (n.type === "form") need(n.recordIdVariable, n.id);
    if (n.type === "filter") need(n.variable, n.id);
    const link = n.type === "link" ? n : n.type === "table" ? n.rowLink : null;
    if (link) {
      if (!isRoute(link.to)) { errors.push(`${n.id}: rotta non valida ${link.to} (es. "/clienti" o "/clienti/:id", minuscole)`); continue; }
      const given = new Set(link.params.map((p) => p.name));
      for (const p of routeParams(link.to)) if (!given.has(p)) errors.push(`${n.id}: manca il valore del parametro di rotta ${p}`);
      if (n.type === "link") for (const p of n.params) need(varName(p.value), n.id);
    }
  }
  return errors;
}

/**
 * The renderable part of a spec that is still being written: nodes that are already complete and attached to the tree.
 * Returns null until there is a root to show.
 */
export function partialSpec(raw: unknown): Spec | null {
  const r = raw as { title?: unknown; style?: unknown; nodes?: unknown } | null;
  if (!r || !Array.isArray(r.nodes)) return null;
  const nodes: Node[] = [];
  const ids = new Set<string>();
  for (const n of r.nodes) {
    const p = NodeSchema.safeParse(n);
    if (!p.success || ids.has(p.data.id)) continue;
    if (p.data.parentId === null ? nodes.length > 0 : !ids.has(p.data.parentId)) continue;
    ids.add(p.data.id);
    nodes.push(p.data);
  }
  if (!nodes.length) return null;
  const style = StyleSchema.safeParse(r.style);
  return { title: typeof r.title === "string" ? r.title : "", style: style.success ? style.data : null, variables: [], nodes };
}
