import { varName, type Query, type Scalar } from "./spec";

/** Substitute {{var}} placeholders; a where clause whose variable is empty is dropped (= "no filter"). */
export function resolveVars(q: Query, vars: Record<string, Scalar | undefined>): Query {
  const where = q.where.flatMap((w) => {
    const name = varName(w.value);
    if (name === null) return [w];
    const v = vars[name];
    return v === null || v === undefined || v === "" ? [] : [{ ...w, value: v }];
  });
  return { ...q, where };
}
