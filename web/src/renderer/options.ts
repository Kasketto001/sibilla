import type { Query, Scalar } from "@sibilla/shared";
import { useSpecQuery } from "./useSpecQuery";

type Source = { optionsQuery: Query | null; optionValue: string | null; optionLabel: string | null; choices?: string[] | null };
export type Option = { value: string; label: string; raw: Scalar };

/** Options of a select: a fixed list of choices, or the rows of its options query. */
export function useOptions(src: Source): { options: Option[]; loading: boolean } {
  const { rows, loading } = useSpecQuery(src.choices?.length ? null : src.optionsQuery);
  if (src.choices?.length) return { options: src.choices.map((c) => ({ value: c, label: c, raw: c })), loading: false };
  const options = (rows ?? []).map((r) => ({
    value: String(r[src.optionValue ?? ""] ?? ""),
    label: String(r[src.optionLabel ?? src.optionValue ?? ""] ?? ""),
    raw: r[src.optionValue ?? ""] ?? null,
  })).filter((o) => o.value !== "");
  return { options, loading };
}
