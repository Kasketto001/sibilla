import { expect, test } from "vitest";
import type { Query } from "@sibilla/shared";
import { resolveVars } from "@sibilla/shared";
import { openDb } from "../src/db";
import { introspect } from "../src/schema";
import { QueryError, buildQuery, checkQuery, runQuery } from "../src/query";

const db = openDb(":memory:");
const schema = introspect(db);
const q = (over: Partial<Query>): Query => ({
  table: "ordini", select: [], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: null, ...over,
});
const run = (query: Query, vars = {}) => runQuery(db, schema, query, vars).rows;

test("simple select with limit", () => {
  const rows = run(q({ table: "clienti", select: ["id", "nome"], limit: 5 }));
  expect(rows).toHaveLength(5);
  expect(Object.keys(rows[0])).toEqual(["id", "nome"]);
});

test("group by with count adds up to all orders", () => {
  const rows = run(q({ select: ["stato"], groupBy: ["stato"], aggregates: [{ fn: "count", field: "id", as: "n" }] }));
  expect(rows.reduce((s, r) => s + (r.n as number), 0)).toBe(300);
});

test("aggregate without select (kpi)", () => {
  const rows = run(q({ aggregates: [{ fn: "sum", field: "totale", as: "tot" }] }));
  expect(rows).toHaveLength(1);
  expect(rows[0].tot).toBeGreaterThan(0);
});

test("join with qualified fields", () => {
  const rows = run(q({ select: ["clienti.nome", "totale"], join: [{ table: "clienti", on: ["cliente_id", "id"] }], limit: 3 }));
  expect(Object.keys(rows[0])).toEqual(["nome", "totale"]);
});

test("order by alias", () => {
  const rows = run(q({
    select: ["stato"], groupBy: ["stato"], aggregates: [{ fn: "sum", field: "totale", as: "tot" }],
    orderBy: [{ field: "tot", dir: "desc" }],
  }));
  const tots = rows.map((r) => r.tot as number);
  expect(tots).toEqual([...tots].sort((a, b) => b - a));
});

test("empty variable drops the where clause", () => {
  const filtered = q({ select: ["id"], where: [{ field: "stato", op: "eq", value: "{{s}}" }], limit: 1000 });
  expect(run(filtered, { s: "" })).toHaveLength(300);
  expect(run(filtered, { s: null })).toHaveLength(300);
  expect(run(filtered, {})).toHaveLength(300);
});

test("set variable filters rows", () => {
  const rows = run(q({ select: ["stato"], where: [{ field: "stato", op: "eq", value: "{{s}}" }], limit: 1000 }), { s: "spedito" });
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.stato === "spedito")).toBe(true);
});

test("like matches substrings", () => {
  const rows = run(q({ table: "clienti", select: ["nome"], where: [{ field: "nome", op: "like", value: "rossi" }], limit: 1000 }));
  expect(rows.every((r) => String(r.nome).toLowerCase().includes("rossi"))).toBe(true);
});

test("internal tables are refused", () => {
  expect(() => run(q({ table: "sib_versions", select: ["id"] }))).toThrow(QueryError);
  expect(checkQuery(q({ table: "sib_versions" }), schema)).not.toEqual([]);
});

test("injected identifiers are refused", () => {
  expect(() => run(q({ table: "clienti", select: ["nome; DROP TABLE clienti"] }))).toThrow(QueryError);
  expect(() => run(q({ table: "clienti", select: ["ordini.id"] }))).toThrow(QueryError);
});

test("injected values are inert", () => {
  const rows = run(q({ table: "clienti", select: ["id"], where: [{ field: "nome", op: "eq", value: "'; DROP TABLE clienti; --" }] }));
  expect(rows).toHaveLength(0);
  expect(run(q({ table: "clienti", select: ["id"], limit: 1 }))).toHaveLength(1);
});

test("limit is capped at 1000 and defaults to 200", () => {
  const big = q({ table: "righe_ordine", select: ["id"] });
  expect(buildQuery({ ...big, limit: 5000 }, schema).sql).toMatch(/limit 1000$/);
  expect(run(big)).toHaveLength(200);
});

test("placeholders are not validation errors", () => {
  expect(checkQuery(q({ where: [{ field: "stato", op: "eq", value: "{{x}}" }] }), schema)).toEqual([]);
});

test("resolveVars substitutes and drops", () => {
  const out = resolveVars(q({ where: [
    { field: "stato", op: "eq", value: "{{a}}" },
    { field: "id", op: "gt", value: "{{b}}" },
    { field: "totale", op: "gt", value: 10 },
  ] }), { a: "nuovo", b: "" });
  expect(out.where).toEqual([{ field: "stato", op: "eq", value: "nuovo" }, { field: "totale", op: "gt", value: 10 }]);
});

test("join with empty select is refused (ambiguous columns)", () => {
  expect(checkQuery(q({ select: [], join: [{ table: "clienti", on: ["cliente_id", "id"] }] }), schema)).not.toEqual([]);
});

test("duplicate output names are refused", () => {
  expect(checkQuery(q({ select: ["id", "clienti.id"], join: [{ table: "clienti", on: ["cliente_id", "id"] }] }), schema).join(" "))
    .toContain("id");
  expect(checkQuery(q({ select: ["stato"], groupBy: ["stato"], aggregates: [{ fn: "count", field: "*", as: "stato" }] }), schema))
    .not.toEqual([]);
});

test("in matches any value of a comma list", () => {
  const rows = run(q({ select: ["stato"], where: [{ field: "stato", op: "in", value: "spedito, annullato" }], limit: 1000 }));
  expect(new Set(rows.map((r) => r.stato))).toEqual(new Set(["spedito", "annullato"]));
});

test("is_null and not_null ignore the value", () => {
  createRecordForNullTest();
  expect(run(q({ table: "clienti", select: ["id"], where: [{ field: "citta", op: "is_null", value: null }], limit: 1000 })).length).toBeGreaterThan(0);
  expect(run(q({ table: "clienti", select: ["citta"], where: [{ field: "citta", op: "not_null", value: null }], limit: 1000 }))
    .every((r) => r.citta !== null)).toBe(true);
});

test("count_distinct counts distinct values", () => {
  const [r] = run(q({ aggregates: [{ fn: "count_distinct", field: "stato", as: "n" }] }));
  expect(r.n).toBe(5);
});

test("date functions bucket by year, month and day", () => {
  const rows = run(q({ select: ["month(data)"], groupBy: ["month(data)"], aggregates: [{ fn: "sum", field: "totale", as: "tot" }], orderBy: [{ field: "month(data)", dir: "asc" }] }));
  expect(Object.keys(rows[0])).toEqual(["month_data", "tot"]);
  expect(rows[0].month_data).toMatch(/^\d{4}-\d{2}$/);
  const [y] = run(q({ select: ["year(data)"], groupBy: ["year(data)"], limit: 1 }));
  expect(y.year_data).toMatch(/^\d{4}$/);
});

test("date functions validate their column", () => {
  expect(checkQuery(q({ select: ["month(boh)"] }), schema)).not.toEqual([]);
  expect(checkQuery(q({ select: ["month(data); drop table x"] }), schema)).not.toEqual([]);
});

function createRecordForNullTest() {
  db.prepare("insert into clienti (nome, email, citta, segmento) values ('Senza Città', 'x@y.it', null, 'PMI')").run();
}
