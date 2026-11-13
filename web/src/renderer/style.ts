import type { CSSProperties } from "react";
import type { SpecStyle } from "@sibilla/shared";

// Same allow-list as the server: plain color syntaxes only, nothing that can end a CSS declaration.
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([\w\s.,%/+-]*\)|[a-z]{3,20})$/i;
const RADIUS = { none: "0rem", small: "0.375rem", medium: "0.75rem", large: "1.25rem" } as const;
const FONT = {
  sans: "'IBM Plex Sans Variable', 'IBM Plex Sans', sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif",
} as const;
const ZOOM = { compact: 0.9, normal: 1, comfortable: 1.08 } as const;

type Vars = CSSProperties & Record<`--${string}`, string>;

/** Turns a spec's style overrides into CSS custom properties on the view container. */
export function styleVars(st: SpecStyle | null | undefined): { className: string; style: Vars; font: boolean } {
  const style: Vars = {};
  if (!st) return { className: "", style, font: false };
  const set = (vars: string[], v: string | null | undefined) => {
    if (v && COLOR.test(v)) for (const k of vars) style[k as `--${string}`] = v;
  };
  set(["--primary", "--ring", "--sidebar-primary"], st.primary);
  set(["--primary-foreground"], st.primaryForeground);
  set(["--background"], st.background);
  set(["--foreground", "--card-foreground", "--popover-foreground"], st.foreground);
  st.palette?.slice(0, 5).forEach((c, i) => set([`--chart-${i + 1}`], c));
  if (st.radius) style["--radius"] = RADIUS[st.radius];
  if (st.font && st.font !== "sans") style.fontFamily = FONT[st.font];
  // ponytail: density via zoom (scales everything uniformly); per-component spacing tokens if it looks off.
  if (st.density && st.density !== "normal") style.zoom = ZOOM[st.density];
  // "light" too is a class: it keeps a view light when the app around it is dark.
  return { className: st.colorScheme ?? "", style, font: !!st.font && st.font !== "sans" };
}
