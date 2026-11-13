import { z } from "zod";
import type { DbSchema } from "./db";

const o = z.strictObject;

/**
 * A collection is a mini webapp's own store: schemaless JSON documents, described by the spec that uses them.
 * Queries, forms and custom views see it as a table whose columns are the declared fields.
 */
export const CollectionSchema = o({
  name: z.string(),
  fields: z.array(o({
    name: z.string(),
    type: z.enum(["text", "number", "boolean", "date"]),
    required: z.boolean(),
    /** Name of another collection (or database table) this field points to, by id. */
    references: z.string().nullable(),
  })),
});
export type Collection = z.infer<typeof CollectionSchema>;

/** Which app's documents a data request works on. The definitions travel with the request: the spec is their source of truth. */
export const AppScopeSchema = z.object({ id: z.string().regex(/^[\w-]{1,64}$/), collections: z.array(CollectionSchema) });
export type AppScope = z.infer<typeof AppScopeSchema>;

/** Columns every document has, managed by the server. */
export const DOC_COLUMNS = ["id", "creato_il", "aggiornato_il"];
const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const COLUMN_TYPE = { text: "text", date: "text", number: "real", boolean: "integer" } as const;

type Table = DbSchema["tables"][number];

/** The database schema as one app sees it: the real tables plus its collections. Assumes collectionProblems() is empty. */
export function withCollections(base: DbSchema, collections: Collection[] | null | undefined): DbSchema {
  if (!collections?.length) return base;
  const pkOf = (table: string) => base.tables.find((t) => t.name === table)?.columns.find((c) => c.pk)?.name ?? "id";
  const auto = { notNull: true, hasDefault: true, references: null };
  const tables: Table[] = collections.map((c) => ({
    name: c.name,
    columns: [
      { name: "id", type: "integer", pk: true, generated: false, ...auto },
      ...c.fields.map((f) => ({
        name: f.name, type: f.references ? "integer" as const : COLUMN_TYPE[f.type], notNull: f.required, pk: false, hasDefault: false,
        generated: false, references: f.references ? { table: f.references, column: pkOf(f.references) } : null,
      })),
      { name: "creato_il", type: "text", pk: false, generated: true, ...auto },
      { name: "aggiornato_il", type: "text", pk: false, generated: true, ...auto },
    ],
  }));
  return { tables: [...base.tables, ...tables] };
}

/** Everything wrong with a set of collection definitions. Names end up in SQL, so they are checked strictly. */
export function collectionProblems(collections: Collection[] | null | undefined, base: DbSchema): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  const known = new Set([...base.tables.map((t) => t.name), ...(collections ?? []).map((c) => c.name)]);
  for (const c of collections ?? []) {
    const where = `collezione ${c.name}`;
    if (!NAME.test(c.name) || /^(sib|sqlite)_/.test(c.name)) problems.push(`${where}: nome non valido (minuscole, cifre e _, senza prefisso sib_)`);
    if (base.tables.some((t) => t.name === c.name)) problems.push(`${where}: esiste già una tabella del database con questo nome`);
    if (names.has(c.name)) problems.push(`${where}: nome duplicato`);
    names.add(c.name);
    if (!c.fields.length) problems.push(`${where}: serve almeno un campo`);
    const fields = new Set<string>();
    for (const f of c.fields) {
      if (!NAME.test(f.name)) problems.push(`${where}: nome di campo non valido ${f.name} (minuscole, cifre e _)`);
      if (DOC_COLUMNS.includes(f.name)) problems.push(`${where}: il campo ${f.name} è automatico, non dichiararlo`);
      if (fields.has(f.name)) problems.push(`${where}: campo duplicato ${f.name}`);
      fields.add(f.name);
      if (f.references && !known.has(f.references)) problems.push(`${where}: ${f.name} punta a una collezione o tabella inesistente (${f.references})`);
    }
  }
  return problems;
}
