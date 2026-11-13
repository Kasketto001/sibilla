import type { Scalar } from "@sibilla/shared";

const num = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const pct = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 });

export function formatValue(v: Scalar | undefined, format: string): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  switch (format) {
    case "number": return Number.isFinite(n) ? num.format(n) : String(v);
    case "currency": return Number.isFinite(n) ? eur.format(n) : String(v);
    case "percent": return Number.isFinite(n) ? pct.format(n > 1 ? n / 100 : n) : String(v);
    case "date": {
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("it-IT");
    }
    default: return String(v);
  }
}
