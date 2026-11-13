import type { AppScope, Query, Scalar } from "@sibilla/shared";
import { api } from "./api";

type Row = Record<string, Scalar>;

/** Data access for one rendered spec: a mini webapp's requests carry its scope, so they reach its own collections. */
export function dataApi(app: AppScope | null) {
  return {
    query: (query: Query, vars: Record<string, Scalar>) => (app ? api.query(query, vars, app) : api.query(query, vars)),
    createRecord: (table: string, values: Row) => (app ? api.createRecord(table, values, app) : api.createRecord(table, values)),
    updateRecord: (table: string, id: number, values: Row) => (app ? api.updateRecord(table, id, values, app) : api.updateRecord(table, id, values)),
    deleteRecord: (table: string, id: number) => (app ? api.deleteRecord(table, id, app) : api.deleteRecord(table, id)),
  };
}
export type DataApi = ReturnType<typeof dataApi>;
