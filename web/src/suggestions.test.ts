import { expect, test } from "vitest";
import type { DbSchema } from "@sibilla/shared";
import { suggestions } from "./suggestions";

const col = (name: string, references: { table: string; column: string } | null = null) =>
  ({ name, type: "text" as const, notNull: false, pk: false, hasDefault: false, generated: false, references });

test("picks the dated fact table and a master table", () => {
  const schema: DbSchema = { tables: [
    { name: "clienti", columns: [col("nome")] },
    { name: "ordini", columns: [col("data"), col("cliente_id", { table: "clienti", column: "id" })] },
  ] };
  const s = suggestions(schema);
  expect(s[0].prompt).toContain("ordini");
  expect(s[3].prompt).toContain("clienti");
});

test("falls back to generic prompts without a schema", () => {
  expect(suggestions(null)).toHaveLength(4);
});
