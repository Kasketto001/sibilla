export type Column = {
  name: string;
  type: "integer" | "real" | "text";
  notNull: boolean;
  pk: boolean;
  hasDefault: boolean;
  /** Computed by the database: readable, never writable. */
  generated: boolean;
  references: { table: string; column: string } | null;
};

export type DbSchema = { tables: { name: string; columns: Column[] }[] };
