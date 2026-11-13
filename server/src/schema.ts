import type { DatabaseSync } from "node:sqlite";
import type { Column, DbSchema } from "@sibilla/shared";

const affinity = (decl: string): Column["type"] => {
  const d = decl.toUpperCase();
  if (d.includes("INT")) return "integer";
  if (/REAL|FLOA|DOUB|NUM|DEC/.test(d)) return "real";
  return "text";
};

export function introspect(db: DatabaseSync): DbSchema {
  const names = db.prepare(
    "select name from sqlite_master where type = 'table' and name not like 'sib\\_%' escape '\\' and name not like 'sqlite\\_%' escape '\\' order by name",
  ).all() as { name: string }[];
  return {
    tables: names.map(({ name }) => {
      const q = JSON.stringify(name); // safe identifier quoting; names come from sqlite_master
      const fks = db.prepare(`pragma foreign_key_list(${q})`).all() as { from: string; table: string; to: string }[];
      const cols = db.prepare(`pragma table_xinfo(${q})`).all() as
        { name: string; type: string; notnull: number; dflt_value: unknown; pk: number; hidden: number }[];
      return {
        name,
        columns: cols.filter((c) => c.hidden !== 1).map((c) => {
          const fk = fks.find((f) => f.from === c.name);
          return {
            name: c.name, type: affinity(c.type), notNull: c.notnull === 1, pk: c.pk > 0,
            hasDefault: c.dflt_value !== null, generated: c.hidden > 1, references: fk ? { table: fk.table, column: fk.to } : null,
          };
        }),
      };
    }),
  };
}
