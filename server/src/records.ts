import type { DatabaseSync } from "node:sqlite";
import type { AppScope, Column, DbSchema, Scalar } from "@sibilla/shared";
import { runQuery } from "./query";

export class RecordError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string> = {}) { super(message); }
}

type Row = Record<string, Scalar>;
type Values = Record<string, Scalar | undefined>;
const q = (s: string) => `"${s}"`;
const now = () => new Date().toISOString();
const isCollection = (app: AppScope | undefined, table: string) => !!app?.collections.some((c) => c.name === table);

function coerce(c: Column, v: Scalar | undefined): { value: string | number | null } | { error: string } {
  if (v === undefined || v === null || v === "") return { value: null };
  if (c.type === "text") return { value: String(v) };
  if (typeof v === "boolean") return { value: Number(v) };
  const n = Number(v);
  if (!Number.isFinite(n) || (c.type === "integer" && !Number.isInteger(n))) return { error: "Numero non valido" };
  return { value: n };
}

/** `schema` must already include the app's collections (withCollections). */
function prepare(db: DatabaseSync, schema: DbSchema, table: string, values: Values, creating: boolean, app?: AppScope) {
  const t = schema.tables.find((x) => x.name === table);
  if (!t) throw new RecordError(`Tabella non scrivibile: ${table}`);
  const errors: Record<string, string> = {};
  const out: Record<string, string | number | null> = {};

  for (const [k, v] of Object.entries(values)) {
    const c = t.columns.find((x) => x.name === k);
    if (!c) { errors[k] = "Campo sconosciuto"; continue; }
    if (c.pk) { errors[k] = "La chiave primaria non è modificabile"; continue; }
    if (c.generated) { errors[k] = "Campo calcolato, non modificabile"; continue; }
    const r = coerce(c, v);
    if ("error" in r) errors[k] = r.error; else out[k] = r.value;
  }
  for (const c of t.columns) {
    if (c.pk || c.generated || !c.notNull || errors[c.name]) continue;
    const missing = creating ? out[c.name] == null && !c.hasDefault : c.name in out && out[c.name] === null;
    if (missing) errors[c.name] = "Campo obbligatorio";
  }
  for (const c of t.columns) {
    const v = out[c.name];
    if (!c.references || v == null || errors[c.name]) continue;
    const hit = isCollection(app, c.references.table)
      ? db.prepare("select 1 from sib_docs where app_id = ? and collection = ? and id = ?").get(app!.id, c.references.table, v)
      : db.prepare(`select 1 from ${q(c.references.table)} where ${q(c.references.column)} = ?`).get(v);
    if (!hit) errors[c.name] = "Valore non valido";
  }
  if (Object.keys(errors).length) throw new RecordError("Dati non validi", errors);
  if (creating) for (const k of Object.keys(out)) if (out[k] === null) delete out[k]; // let defaults apply
  return { t, out, pk: t.columns.find((c) => c.pk)?.name ?? "rowid" };
}

const getDoc = (db: DatabaseSync, schema: DbSchema, app: AppScope, table: string, id: number | bigint) =>
  runQuery(db, schema, { table, select: [], join: [], where: [{ field: "id", op: "eq", value: Number(id) }], groupBy: [], aggregates: [], orderBy: [], limit: 1 }, {}, app)
    .rows[0] as Row | undefined;

function insertDoc(db: DatabaseSync, app: AppScope, table: string, out: Record<string, string | number | null>) {
  const t = now();
  return db.prepare("insert into sib_docs (app_id, collection, data, created_at, updated_at) values (?, ?, ?, ?, ?)")
    .run(app.id, table, JSON.stringify(out), t, t).lastInsertRowid;
}

export function createRecord(db: DatabaseSync, schema: DbSchema, table: string, values: Values, app?: AppScope): Row {
  const { out, pk } = prepare(db, schema, table, values, true, app);
  if (isCollection(app, table)) return getDoc(db, schema, app!, table, insertDoc(db, app!, table, out))!;
  const keys = Object.keys(out);
  const sql = keys.length
    ? `insert into ${q(table)} (${keys.map(q).join(", ")}) values (${keys.map(() => "?").join(", ")})`
    : `insert into ${q(table)} default values`;
  const { lastInsertRowid } = db.prepare(sql).run(...Object.values(out));
  return db.prepare(`select * from ${q(table)} where ${q(pk)} = ?`).get(lastInsertRowid) as Row;
}

export function updateRecord(db: DatabaseSync, schema: DbSchema, table: string, id: number, values: Values, app?: AppScope): Row {
  const { out, pk } = prepare(db, schema, table, values, false, app);
  if (isCollection(app, table)) {
    // Merge patch: only the given fields change, a null clears the field.
    const { changes } = db.prepare("update sib_docs set data = json_patch(data, ?), updated_at = ? where id = ? and app_id = ? and collection = ?")
      .run(JSON.stringify(out), now(), id, app!.id, table);
    if (!changes) throw new RecordError("Record non trovato");
    return getDoc(db, schema, app!, table, id)!;
  }
  const get = () => db.prepare(`select * from ${q(table)} where ${q(pk)} = ?`).get(id) as Row | undefined;
  if (!get()) throw new RecordError("Record non trovato");
  const keys = Object.keys(out);
  if (keys.length) db.prepare(`update ${q(table)} set ${keys.map((k) => `${q(k)} = ?`).join(", ")} where ${q(pk)} = ?`).run(...Object.values(out), id);
  return get()!;
}

export function deleteRecord(db: DatabaseSync, schema: DbSchema, table: string, id: number, app?: AppScope): void {
  const t = schema.tables.find((x) => x.name === table);
  if (!t) throw new RecordError(`Tabella non scrivibile: ${table}`);
  let changes;
  if (isCollection(app, table)) {
    changes = db.prepare("delete from sib_docs where id = ? and app_id = ? and collection = ?").run(id, app!.id, table).changes;
    // Documents are not relational: nothing stops the delete, so fields that pointed here are emptied instead of left dangling.
    if (changes) for (const c of app!.collections) for (const f of c.fields) {
      if (f.references !== table) continue;
      db.prepare(`update sib_docs set data = json_remove(data, '$.${f.name}') where app_id = ? and collection = ? and json_extract(data, '$.${f.name}') = ?`)
        .run(app!.id, c.name, id);
    }
  } else {
    const pk = t.columns.find((c) => c.pk)?.name ?? "rowid";
    try { changes = db.prepare(`delete from ${q(table)} where ${q(pk)} = ?`).run(id).changes; }
    catch (e) {
      if (/FOREIGN KEY/i.test((e as Error).message)) throw new RecordError("Questo record è usato da altri dati e non può essere eliminato");
      throw e;
    }
  }
  if (!changes) throw new RecordError("Record non trovato");
}

export type SeedItem = { collezione: string; documenti: Values[] };

/**
 * Example documents for brand-new collections (ones that already hold data are left alone). All or nothing.
 * A field that references a collection seeded in the same call holds the 1-based position of the target document in that list.
 */
export function seedDocs(db: DatabaseSync, schema: DbSchema, app: AppScope, items: SeedItem[]): void {
  const seeded = new Map<string, (number | bigint)[]>();
  db.exec("begin");
  try {
    for (const item of items) {
      const c = app.collections.find((x) => x.name === item.collezione);
      if (!c) throw new RecordError(`dati_iniziali: collezione non dichiarata ${item.collezione}`);
      const { n } = db.prepare("select count(*) n from sib_docs where app_id = ? and collection = ?").get(app.id, c.name) as { n: number };
      if (n > 0) continue;
      const ids: (number | bigint)[] = [];
      item.documenti.forEach((doc, i) => {
        const values = { ...doc };
        for (const f of c.fields) {
          const targets = f.references ? seeded.get(f.references) : undefined;
          if (!targets || values[f.name] == null) continue;
          const id = targets[Number(values[f.name]) - 1];
          if (id === undefined) throw new RecordError(`dati_iniziali ${c.name}[${i + 1}].${f.name}: indica la posizione (da 1) di un documento di ${f.references}`);
          values[f.name] = Number(id);
        }
        try { ids.push(insertDoc(db, app, c.name, prepare(db, schema, c.name, values, true, app).out)); }
        catch (e) {
          if (!(e instanceof RecordError)) throw e;
          const detail = Object.entries(e.fieldErrors).map(([k, m]) => `${k}: ${m}`).join(", ");
          throw new RecordError(`dati_iniziali ${c.name}[${i + 1}]: ${detail || e.message}`);
        }
      });
      seeded.set(c.name, ids);
    }
    db.exec("commit");
  } catch (e) { db.exec("rollback"); throw e; }
}

/** Adds documents to a collection (from an import), validated like any other write. All or nothing. Returns how many. */
export function importDocs(db: DatabaseSync, schema: DbSchema, app: AppScope, collection: string, documents: Values[]): number {
  if (!isCollection(app, collection)) throw new RecordError(`Collezione sconosciuta: ${collection}`);
  db.exec("begin");
  try {
    documents.forEach((doc, i) => {
      // id and the automatic dates of an export are dropped: the documents are new here.
      const { id: _id, creato_il: _c, aggiornato_il: _a, ...values } = doc;
      try { insertDoc(db, app, collection, prepare(db, schema, collection, values, true, app).out); }
      catch (e) {
        if (!(e instanceof RecordError)) throw e;
        const detail = Object.entries(e.fieldErrors).map(([k, m]) => `${k}: ${m}`).join(", ");
        throw new RecordError(`Documento ${i + 1}: ${detail || e.message}`);
      }
    });
    db.exec("commit");
    return documents.length;
  } catch (e) { db.exec("rollback"); throw e; }
}

/** Empties a collection. Returns how many documents were removed. */
export function clearDocs(db: DatabaseSync, app: AppScope, collection: string): number {
  if (!isCollection(app, collection)) throw new RecordError(`Collezione sconosciuta: ${collection}`);
  return Number(db.prepare("delete from sib_docs where app_id = ? and collection = ?").run(app.id, collection).changes);
}
