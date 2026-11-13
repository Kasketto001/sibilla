import type { DatabaseSync } from "node:sqlite";
import { dateFn, outputName, resolveVars, varName, type AppScope, type DbSchema, type Query, type Scalar } from "@sibilla/shared";

export class QueryError extends Error {}

export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 1000;
const OPS = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE" } as const;
const DATE_FMT = { year: "%Y", month: "%Y-%m", day: "%Y-%m-%d" } as const;
const IDENT = /^\w+$/;

const quote = (s: string) => `"${s}"`;

/** Resolve "col" or "table.col" against the query's tables; returns the quoted SQL ref or null. */
function resolver(q: Query, schema: DbSchema) {
  const tables = [q.table, ...q.join.map((j) => j.table)];
  const has = (t: string, c: string) =>
    tables.includes(t) && !!schema.tables.find((x) => x.name === t)?.columns.some((x) => x.name === c);
  const plain = (field: string): string | null => {
    const parts = field.split(".");
    const [t, c] = parts.length === 2 ? parts : parts.length === 1 ? [q.table, parts[0]] : [null, null];
    return t && c && has(t, c) ? `${quote(t)}.${quote(c)}` : null;
  };
  return (field: string): string | null => {
    const d = dateFn(field);
    if (!d) return plain(field);
    const inner = plain(d.field);
    return inner ? `strftime('${DATE_FMT[d.fn]}', ${inner})` : null;
  };
}

export function checkQuery(q: Query, schema: DbSchema): string[] {
  const errors: string[] = [];
  const tableOk = (t: string) => schema.tables.some((x) => x.name === t);
  if (!tableOk(q.table)) return [`tabella inesistente: ${q.table}`];
  for (const j of q.join) if (!tableOk(j.table)) errors.push(`tabella inesistente: ${j.table}`);
  if (errors.length) return errors;

  const ref = resolver(q, schema);
  const field = (f: string, where: string) => { if (!ref(f)) errors.push(`${where}: colonna inesistente ${f}`); };
  for (const j of q.join) {
    field(j.on[0], "join");
    if (!ref(`${j.table}.${j.on[1]}`)) errors.push(`join: colonna inesistente ${j.table}.${j.on[1]}`);
  }
  q.select.forEach((f) => field(f, "select"));
  q.groupBy.forEach((f) => field(f, "groupBy"));
  q.where.forEach((w) => field(w.field, "where"));
  const aliases = new Set<string>();
  for (const a of q.aggregates) {
    if (!(a.fn === "count" && a.field === "*")) field(a.field, "aggregates");
    if (!IDENT.test(a.as)) errors.push(`alias non valido: ${a.as}`);
    if (aliases.has(a.as)) errors.push(`alias duplicato: ${a.as}`);
    aliases.add(a.as);
  }
  if (q.join.length && !q.select.length && !q.aggregates.length) errors.push("con un join serve un select esplicito");
  const names = [...q.select.map(outputName), ...q.aggregates.map((a) => a.as)];
  for (const n of new Set(names.filter((n, i) => names.indexOf(n) !== i))) errors.push(`nome di colonna duplicato nel risultato: ${n}`);
  for (const o of q.orderBy) if (!aliases.has(o.field) && !ref(o.field)) errors.push(`orderBy: campo sconosciuto ${o.field}`);
  return errors;
}

const bind = (v: Scalar): string | number | null => (typeof v === "boolean" ? Number(v) : v);

/** A collection as a derived table: one column per declared field, read out of the JSON documents of one app. */
function docSource(app: AppScope, table: string, params: (string | number | null)[]): string | null {
  const c = app.collections.find((x) => x.name === table);
  if (!c) return null;
  for (const n of [c.name, ...c.fields.map((f) => f.name)]) if (!IDENT.test(n)) throw new QueryError(`nome non valido: ${n}`);
  params.push(app.id, table);
  const fields = c.fields.map((f) => `, json_extract(data, '$.${f.name}') as ${quote(f.name)}`).join("");
  return `(select id, created_at as "creato_il", updated_at as "aggiornato_il"${fields} from sib_docs where app_id = ? and collection = ?) as ${quote(table)}`;
}

/** `schema` must already include the app's collections (withCollections). */
export function buildQuery(q: Query, schema: DbSchema, app?: AppScope): { sql: string; params: (string | number | null)[] } {
  const errors = checkQuery(q, schema);
  if (errors.length) throw new QueryError(errors.join("; "));
  const ref = (f: string) => resolver(q, schema)(f)!;
  const params: (string | number | null)[] = [];

  const cols = [
    ...q.select.map((f) => `${ref(f)} as ${quote(outputName(f))}`),
    ...q.aggregates.map((a) => {
      const arg = a.field === "*" ? "*" : ref(a.field);
      return a.fn === "count_distinct" ? `count(distinct ${arg}) as ${quote(a.as)}` : `${a.fn}(${arg}) as ${quote(a.as)}`;
    }),
  ];
  const source = (t: string) => (app && docSource(app, t, params)) ?? quote(t);
  let sql = `select ${cols.length ? cols.join(", ") : "*"} from ${source(q.table)}`;
  for (const j of q.join) sql += ` join ${source(j.table)} on ${ref(j.on[0])} = ${quote(j.table)}.${quote(j.on[1])}`;
  if (q.where.length) {
    sql += " where " + q.where.map((w) => {
      if (varName(w.value) !== null) throw new QueryError(`variabile non risolta: ${w.value}`);
      if (w.op === "is_null") return `${ref(w.field)} is null`;
      if (w.op === "not_null") return `${ref(w.field)} is not null`;
      if (w.op === "in") {
        const items = String(w.value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
        if (!items.length) return "0";
        params.push(...items);
        return `${ref(w.field)} in (${items.map(() => "?").join(", ")})`;
      }
      params.push(w.op === "like" ? `%${w.value}%` : bind(w.value));
      return `${ref(w.field)} ${OPS[w.op]} ?`;
    }).join(" and ");
  }
  if (q.groupBy.length) sql += " group by " + q.groupBy.map(ref).join(", ");
  if (q.orderBy.length) {
    const aliases = new Set(q.aggregates.map((a) => a.as));
    sql += " order by " + q.orderBy.map((o) => `${aliases.has(o.field) ? quote(o.field) : ref(o.field)} ${o.dir}`).join(", ");
  }
  sql += ` limit ${Math.min(Math.max(1, q.limit ?? DEFAULT_LIMIT), MAX_LIMIT)}`;
  return { sql, params };
}

export function runQuery(db: DatabaseSync, schema: DbSchema, q: Query, vars: Record<string, Scalar>, app?: AppScope) {
  const { sql, params } = buildQuery(resolveVars(q, vars), schema, app);
  return { rows: db.prepare(sql).all(...params) as Record<string, Scalar>[] };
}
