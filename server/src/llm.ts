import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { PROVIDERS, effortFor, modelInfo, type ProviderId } from "@sibilla/shared";
import { GenerateError, makeClaudeStep, type LlmStep } from "./generate";
import { makeGeminiStep } from "./gemini";
import type { KeyStore } from "./keys";
import { makeOpenAIStep } from "./openai";

const BUILD: Record<ProviderId, (apiKey: string) => LlmStep> = {
  anthropic: (apiKey) => makeClaudeStep(new Anthropic({ apiKey })),
  openai: (apiKey) => makeOpenAIStep(new OpenAI({ apiKey })),
  google: (apiKey) => makeGeminiStep(new GoogleGenAI({ apiKey })),
};

/** Sends each turn to the provider of the chosen model, with the key currently configured for it. */
export function routerStep(keys: KeyStore): LlmStep {
  const cache = new Map<string, LlmStep>(); // one client per provider and key
  return (args) => {
    const { provider } = modelInfo(args.llm.model);
    const key = keys.get(provider);
    if (!key) {
      const p = PROVIDERS.find((x) => x.id === provider)!;
      throw new GenerateError(`Manca la chiave API di ${p.company}: aggiungila da «Accesso ai modelli» nelle impostazioni del modello`);
    }
    const id = `${provider}:${key}`;
    if (!cache.has(id)) cache.set(id, BUILD[provider](key));
    return cache.get(id)!({ ...args, llm: { ...args.llm, effort: effortFor(args.llm.model, args.llm.effort) } });
  };
}

export type VerifyKey = (provider: ProviderId, apiKey: string) => Promise<void>;

/** Checks a key with a free call (listing models). Throws the provider's error when it is not accepted. */
export const verifyKey: VerifyKey = async (provider, apiKey) => {
  if (provider === "anthropic") await new Anthropic({ apiKey, maxRetries: 0 }).models.list({ limit: 1 });
  else if (provider === "openai") await new OpenAI({ apiKey, maxRetries: 0 }).models.list();
  else await new GoogleGenAI({ apiKey }).models.list({ config: { pageSize: 1 } });
};
