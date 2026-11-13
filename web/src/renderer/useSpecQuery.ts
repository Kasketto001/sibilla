import { useEffect, useState } from "react";
import { resolveVars, varName, type Query, type Scalar } from "@sibilla/shared";
import { useRender } from "./context";

type Row = Record<string, Scalar>;

/** Runs a structured query; refetches when the variables it uses or the refresh key change. */
export function useSpecQuery(query: Query | null) {
  const { vars, refreshKey, data } = useRender();
  const used: Record<string, Scalar> = {};
  for (const w of query?.where ?? []) {
    const n = varName(w.value);
    if (n) used[n] = vars[n] ?? null;
  }
  const key = JSON.stringify([query, used, refreshKey]);
  const [state, setState] = useState<{ rows: Row[] | null; error: string | null; key: string | null }>(
    { rows: null, error: null, key: null },
  );

  useEffect(() => {
    if (!query) return;
    let live = true;
    // Send the unresolved query: the server resolves vars (and drops empty filters) itself.
    data.query(query, used).then(
      (r) => live && setState({ rows: r.rows, error: null, key }),
      (e: Error) => live && setState({ rows: null, error: e.message, key }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Stale-while-revalidate: keep showing the last result while a new one loads, so a refresh
  // after a save doesn't flash skeletons (or empty a select's options, resetting its value).
  const fresh = state.key === key;
  return {
    rows: state.rows,
    error: fresh ? state.error : null,
    loading: !!query && !fresh && state.rows === null,
    /** True while showing a previous result for a different query/vars. */
    stale: !!query && !fresh,
    resolved: query ? resolveVars(query, used) : null,
  };
}
