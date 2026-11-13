import type { Spec } from "@sibilla/shared";
import { buildView } from "./bundle";
import type { LibraryStore } from "./libraries";

// Colors become CSS custom properties: allow plain color syntaxes only, nothing that could close a declaration.
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([\w\s.,%/+-]*\)|[a-z]{3,20})$/i;

/** Problems with style overrides and custom nodes. Custom nodes are fully built (libraries installed), so the model sees real errors. */
export async function customProblems(spec: Spec, libraries: LibraryStore): Promise<string[]> {
  const problems: string[] = [];
  const st = spec.style;
  if (st) {
    for (const k of ["primary", "primaryForeground", "background", "foreground"] as const) {
      const v = st[k];
      if (v != null && !COLOR.test(v)) problems.push(`style.${k}: colore non valido "${v}" (usa #hex, rgb(), hsl() o oklch())`);
    }
    for (const v of st.palette ?? []) if (!COLOR.test(v)) problems.push(`style.palette: colore non valido "${v}"`);
  }
  for (const n of spec.nodes) {
    if (n.type !== "custom") continue;
    if (!/export\s+default\b/.test(n.source)) { problems.push(`${n.id}: il modulo deve avere un "export default" con il componente`); continue; }
    const r = await buildView(n, libraries);
    if ("error" in r) problems.push(`${n.id}: ${r.error}`);
  }
  return problems;
}
