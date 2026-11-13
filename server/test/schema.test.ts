import { expect, test } from "vitest";
import { openDb } from "../src/db";
import { introspect } from "../src/schema";

test("introspection lists demo tables only", () => {
  const s = introspect(openDb(":memory:"));
  expect(s.tables.map((t) => t.name)).toEqual(["clienti", "ordini", "prodotti", "righe_ordine"]);
});

test("introspection reads pk and foreign keys", () => {
  const s = introspect(openDb(":memory:"));
  const col = (t: string, c: string) => s.tables.find((x) => x.name === t)!.columns.find((x) => x.name === c)!;
  expect(col("ordini", "cliente_id").references).toEqual({ table: "clienti", column: "id" });
  expect(col("clienti", "id").pk).toBe(true);
  expect(col("clienti", "nome")).toMatchObject({ type: "text", notNull: true, hasDefault: false });
  expect(col("prodotti", "attivo").hasDefault).toBe(true);
  expect(col("prodotti", "prezzo").type).toBe("real");
});

test("seed has 300 orders whose totals match their lines", () => {
  const db = openDb(":memory:");
  expect(db.prepare("select count(*) n from ordini").get()).toEqual({ n: 300 });
  const bad = db.prepare(`select count(*) n from ordini o where abs(o.totale -
    (select sum(quantita * prezzo_unitario) from righe_ordine r where r.ordine_id = o.id)) > 0.001`).get();
  expect(bad).toEqual({ n: 0 });
});

test("seed is deterministic", () => {
  const first = () => openDb(":memory:").prepare("select * from ordini order by id limit 1").get();
  expect(first()).toEqual(first());
});

test("ordini exposes a generated read-only mese column", () => {
  const db = openDb(":memory:");
  const c = introspect(db).tables.find((t) => t.name === "ordini")!.columns.find((x) => x.name === "mese")!;
  expect(c).toMatchObject({ type: "text", generated: true });
  const r = db.prepare("select data, mese from ordini limit 1").get() as { data: string; mese: string };
  expect(r.mese).toBe(r.data.slice(0, 7));
});
