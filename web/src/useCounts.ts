import { useEffect, useState } from "react";
import type { Query } from "@sibilla/shared";
import { api } from "./api";

const count = (table: string): Query => ({ table, select: [], join: [], where: [], groupBy: [], aggregates: [{ fn: "count", field: "*", as: "n" }], orderBy: [], limit: 1 });

/** How many records each table holds; a table whose count can't be read stays without a figure. `epoch` changes when data may have changed. */
export function useCounts(tables: string[], epoch = 0): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = tables.join(",");
  useEffect(() => {
    let live = true;
    for (const t of tables) {
      Promise.resolve(api.query(count(t), {})).then((r) => {
        const n = r?.rows?.[0]?.n;
        if (live && typeof n === "number") setCounts((c) => ({ ...c, [t]: n }));
      }, () => {});
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, epoch]);
  return counts;
}
