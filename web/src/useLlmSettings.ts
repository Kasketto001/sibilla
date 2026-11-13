import { useCallback, useState } from "react";
import { DEFAULT_LLM, EFFORT_IDS, MODEL_IDS, effortFor, type LlmOptions } from "@sibilla/shared";

const KEY = "sibilla.llm";

/** Stored settings, ignoring anything that is no longer a valid choice. */
export function readLlm(): LlmOptions {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<LlmOptions>;
    const model = MODEL_IDS.includes(s.model as never) ? s.model! : DEFAULT_LLM.model;
    return {
      model,
      effort: effortFor(model, EFFORT_IDS.includes(s.effort as never) ? s.effort! : DEFAULT_LLM.effort),
      thinking: typeof s.thinking === "boolean" ? s.thinking : DEFAULT_LLM.thinking,
    };
  } catch { return DEFAULT_LLM; }
}

/** Model, effort and reasoning visibility for generation, remembered in this browser. */
export function useLlmSettings() {
  const [llm, setLlm] = useState(readLlm);
  const update = useCallback((patch: Partial<LlmOptions>) => setLlm((cur) => {
    const next = { ...cur, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep it for this session only */ }
    return next;
  }), []);
  return [llm, update] as const;
}
