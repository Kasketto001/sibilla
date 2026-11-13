import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ScalarSchema, type DbSchema, type Scalar } from "@sibilla/shared";
import { RecordError, createRecord } from "./records";
import { introspect } from "./schema";

/** Names end up in SQL: lowercase identifiers only, and never the app's own tables. */
const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const reserved = (n: string) => /^(sib|sqlite)_/.test(n) || n === "id";
const SQL_TYPE = { text: "text", number: "real", integer: "integer", boolean: "integer", date: "text" } as const;

export const ColumnDefSchema = z.object({
  name: z.string(),
  type: z.enum(["text", "number", "integer", "boolean", "date"]),
  required: z.boolean().default(false),
  /** Name of a table this column points to, by its id. */
  references: z.string().nullable().default(null),
});
export type ColumnDef = z.infer<typeof ColumnDefSchema>;
export const TableDefSchema = z.object({ name: z.string(), columns: z.array(ColumnDefSchema).min(1, "serve almeno una colonna").max(60) });
export type TableDef = z.infer<typeof TableDefSchema>;
export const RowsSchema = z.array(z.record(z.string(), ScalarSchema)).min(1).max(2000);

const q = (s: string) => `"${s}"`;

function columnSql(c: ColumnDef, schema: DbSchema, adding: boolean): string {
  if (!NAME.test(c.name) || reserved(c.name)) throw new RecordError(`Nome di colonna non valido: ${c.name} (minuscole, cifre e _; "id" è automatico)`);
  let sql = `${q(c.name)} ${SQL_TYPE[c.type]}`;
  // A column added to a table that already has rows cannot be required: those rows have no value for it.
  if (c.required && !adding) sql += " not null";
  if (c.references) {
    const target = schema.tables.find((t) => t.name === c.references);
    const pk = target?.columns.find((x) => x.pk)?.name;
    if (!target || !pk) throw new RecordError(`${c.name}: la tabella ${c.references} non esiste`);
    sql += ` references ${q(target.name)}(${q(pk)})`;
  }
  return sql;
}

/** Creates a table (always with an automatic numeric id) and returns the schema that now includes it. */
export function createTable(db: DatabaseSync, schema: DbSchema, def: TableDef): DbSchema {
  if (!NAME.test(def.name) || reserved(def.name)) throw new RecordError(`Nome di tabella non valido: ${def.name} (minuscole, cifre e _)`);
  if (schema.tables.some((t) => t.name === def.name)) throw new RecordError(`La tabella ${def.name} esiste già`);
  const names = def.columns.map((c) => c.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice) throw new RecordError(`Colonna duplicata: ${twice}`);
  db.exec(`create table ${q(def.name)} (id integer primary key, ${def.columns.map((c) => columnSql(c, schema, false)).join(", ")})`);
  return introspect(db);
}

export function addColumn(db: DatabaseSync, schema: DbSchema, table: string, column: ColumnDef): DbSchema {
  const t = schema.tables.find((x) => x.name === table);
  if (!t) throw new RecordError(`La tabella ${table} non esiste`);
  if (t.columns.some((c) => c.name === column.name)) throw new RecordError(`La colonna ${column.name} esiste già`);
  db.exec(`alter table ${q(table)} add column ${columnSql(column, schema, true)}`);
  return introspect(db);
}

export function dropTable(db: DatabaseSync, schema: DbSchema, table: string): DbSchema {
  if (!schema.tables.some((x) => x.name === table)) throw new RecordError(`La tabella ${table} non esiste`);
  const used = schema.tables.filter((t) => t.name !== table && t.columns.some((c) => c.references?.table === table)).map((t) => t.name);
  if (used.length) throw new RecordError(`Non posso eliminare ${table}: ci puntano ${used.join(", ")}. Elimina prima quelle tabelle.`);
  db.exec(`drop table ${q(table)}`);
  return introspect(db);
}

/** Adds rows to a table, validated like any other write. All or nothing. Returns how many. */
export function insertRows(db: DatabaseSync, schema: DbSchema, table: string, rows: Record<string, Scalar>[]): number {
  db.exec("begin");
  try {
    rows.forEach((row, i) => {
      try { createRecord(db, schema, table, row); }
      catch (e) {
        if (!(e instanceof RecordError)) throw e;
        const detail = Object.entries(e.fieldErrors).map(([k, m]) => `${k}: ${m}`).join(", ");
        throw new RecordError(`Riga ${i + 1}: ${detail || e.message}`);
      }
    });
    db.exec("commit");
    return rows.length;
  } catch (e) { db.exec("rollback"); throw e; }
}
