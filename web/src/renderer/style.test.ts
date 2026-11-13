import { expect, test } from "vitest";
import { styleVars } from "./style";

test("no style means no overrides", () => {
  expect(styleVars(null)).toEqual({ className: "", style: {}, font: false });
});

test("colors, palette and radius become CSS custom properties", () => {
  const r = styleVars({ primary: "#7c3aed", primaryForeground: "#fff", palette: ["#111", "#222"], radius: "none", background: "#0b1020" });
  expect(r.style).toMatchObject({ "--primary": "#7c3aed", "--ring": "#7c3aed", "--primary-foreground": "#fff",
    "--chart-1": "#111", "--chart-2": "#222", "--radius": "0rem", "--background": "#0b1020" });
});

test("dark scheme, font and density", () => {
  const r = styleVars({ colorScheme: "dark", font: "serif", density: "compact" });
  expect(r.className).toContain("dark");
  expect(r.font).toBe(true);
  expect(String(r.style.fontFamily)).toMatch(/serif/);
  expect(r.style.zoom).toBe(0.9);
});

test("values that could break out of a declaration are dropped", () => {
  expect(styleVars({ primary: "red; background: url(x)" }).style).not.toHaveProperty("--primary");
});
