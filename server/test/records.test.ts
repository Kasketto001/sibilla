import { expect, test } from "vitest";
import { openDb } from "../src/db";
import { introspect } from "../src/schema";
import { RecordError, createRecord, updateRecord } from "../src/records";

const db = openDb(":memory:");
const schema = introspect(db);

const fieldErrors = (fn: () => unknown) => {
  try { fn(); } catch (e) { if (e instanceof RecordError) return e.fieldErrors; throw e; }
  throw new Error("expected RecordError");
};

test("creates a valid cliente", () => {
  const r = createRecord(db, schema, "clienti", { nome: "Nuova Srl", email: "a@b.it", citta: "Lecce", segmento: "PMI" });
  expect(typeof r.id).toBe("number");
  expect(r.nome).toBe("Nuova Srl");
});

test("missing required field is a field error", () => {
  expect(fieldErrors(() => createRecord(db, schema, "clienti", { email: "a@b.it", segmento: "PMI" })))
    .toMatchObject({ nome: "Campo obbligatorio" });
});

test("empty string counts as missing", () => {
  expect(fieldErrors(() => createRecord(db, schema, "clienti", { nome: "", email: "a@b.it", segmento: "PMI" })))
    .toMatchObject({ nome: "Campo obbligatorio" });
});

test("dangling foreign key is a field error", () => {
  expect(fieldErrors(() => createRecord(db, schema, "ordini", { cliente_id: 99999, data: "2026-01-01", stato: "nuovo", totale: 0 })))
    .toMatchObject({ cliente_id: "Valore non valido" });
});

test("numeric strings are coerced", () => {
  const r = createRecord(db, schema, "prodotti", { nome: "X", categoria: "Test", prezzo: "12.5", attivo: true });
  expect(r.prezzo).toBe(12.5);
  expect(r.attivo).toBe(1);
});

test("non-numeric value for number column is a field error", () => {
  expect(fieldErrors(() => createRecord(db, schema, "prodotti", { nome: "X", categoria: "T", prezzo: "abc" })))
    .toMatchObject({ prezzo: "Numero non valido" });
});

test("updates an order", () => {
  const r = updateRecord(db, schema, "ordini", 1, { stato: "spedito" });
  expect(r.stato).toBe("spedito");
  expect(db.prepare("select stato from ordini where id = 1").get()).toEqual({ stato: "spedito" });
});

test("primary key cannot be written", () => {
  expect(fieldErrors(() => updateRecord(db, schema, "ordini", 1, { id: 5 }))).toHaveProperty("id");
});

test("unknown column is a field error", () => {
  expect(fieldErrors(() => updateRecord(db, schema, "ordini", 1, { boh: 1 }))).toHaveProperty("boh");
});

test("update of missing record fails", () => {
  expect(() => updateRecord(db, schema, "ordini", 99999, { stato: "x" })).toThrow("Record non trovato");
});

test("internal tables are not writable", () => {
  expect(() => createRecord(db, schema, "sib_interfaces", { nome: "x" })).toThrow(RecordError);
});

test("generated columns are not writable", () => {
  expect(fieldErrors(() => updateRecord(db, schema, "ordini", 1, { mese: "2020-01" }))).toHaveProperty("mese");
});

test("creating an order fills mese", () => {
  const r = createRecord(db, schema, "ordini", { cliente_id: 1, data: "2026-03-15", stato: "nuovo", totale: 10 });
  expect(r.mese).toBe("2026-03");
});
