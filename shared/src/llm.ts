/** Who serves a model. `env`: the environment variable that can hold its API key; `keysUrl`: where the user creates one. */
export const PROVIDERS = [
  { id: "anthropic", label: "Claude", company: "Anthropic", env: "ANTHROPIC_API_KEY", keysUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "ChatGPT", company: "OpenAI", env: "OPENAI_API_KEY", keysUrl: "https://platform.openai.com/api-keys" },
  { id: "google", label: "Gemini", company: "Google", env: "GEMINI_API_KEY", keysUrl: "https://aistudio.google.com/apikey" },
] as const;
export type ProviderId = (typeof PROVIDERS)[number]["id"];
export const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as [ProviderId, ...ProviderId[]];

/** How hard the model works on a request: more effort = more reasoning, time and tokens. */
export const EFFORTS = [
  { id: "low", label: "Basso" }, { id: "medium", label: "Medio" }, { id: "high", label: "Alto" },
  { id: "xhigh", label: "Molto alto" }, { id: "max", label: "Massimo" },
] as const;
export type Effort = (typeof EFFORTS)[number]["id"];
export const EFFORT_IDS = EFFORTS.map((e) => e.id) as [Effort, ...Effort[]];

const ALL: readonly Effort[] = EFFORT_IDS;
const TO_HIGH: readonly Effort[] = ["low", "medium", "high"];

/** List price in dollars per million tokens, [input, output]; null when not known. */
type Price = readonly [number, number] | null;

/**
 * Models the user can pick for generation, by provider. `price` only feeds the cost estimate shown in the chat. `efforts`: the levels the model accepts.
 * `fallback` (Claude only): the API can reroute a declined request to another model.
 */
export const MODELS = [
  { id: "claude-opus-5-5", provider: "anthropic", label: "Opus 5.5", hint: "Equilibrato: la scelta consigliata", efforts: ALL, price: [4, 20] as Price, fallback: true },
  { id: "claude-fable-5-1", provider: "anthropic", label: "Fable 5.1", hint: "Il più capace, più lento e costoso", efforts: ALL, price: [10, 50] as Price, fallback: true },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Sonnet 5.5", hint: "Più rapido ed economico", efforts: ALL, price: [2, 10] as Price, fallback: true },
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Haiku 5.5", hint: "Il più veloce, per richieste semplici", efforts: ALL, price: [0.1, 0.5] as Price, fallback: false },
  { id: "gpt-6-astra", provider: "openai", label: "GPT-6 Astra", hint: "Il più capace di OpenAI, per i lavori più impegnativi", efforts: ALL, price: [10, 50] as Price, fallback: false },
  { id: "gpt-6.1-sol", provider: "openai", label: "GPT-6.1 Sol", hint: "Vicino ad Astra, a costo più basso", efforts: ALL, price: [2, 10] as Price, fallback: false },
  { id: "gpt-6.1-terra", provider: "openai", label: "GPT-6.1 Terra", hint: "Rapido ed efficiente", efforts: ALL, price: [1, 5] as Price, fallback: false },
  { id: "gpt-6-luna", provider: "openai", label: "GPT-6 Luna", hint: "Il più economico, per richieste semplici", efforts: ALL, price: [0.1, 0.5] as Price, fallback: false },
  { id: "gemini-4-carbon", provider: "google", label: "Gemini 4 Carbon", hint: "Il più capace di Google", efforts: TO_HIGH, price: null as Price, fallback: false },
  { id: "gemini-4-argon", provider: "google", label: "Gemini 4 Argon", hint: "Più rapido ed economico di Carbon", efforts: TO_HIGH, price: null as Price, fallback: false },
  { id: "gemini-4-hydrogen", provider: "google", label: "Gemini 4 Hydrogen", hint: "Veloce, per l'uso di tutti i giorni", efforts: ["low", "medium", "high", "xhigh"] as readonly Effort[], price: null as Price, fallback: false },
  { id: "gemini-3.5-flash-lite", provider: "google", label: "Gemini 3.5 Flash-Lite", hint: "Il più veloce ed economico", efforts: TO_HIGH, price: null as Price, fallback: false },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];
export const MODEL_IDS = MODELS.map((m) => m.id) as [ModelId, ...ModelId[]];
export const modelInfo = (id: ModelId) => MODELS.find((m) => m.id === id)!;

/** The requested effort if the model accepts it, otherwise the closest level it does accept. */
export function effortFor(model: ModelId, effort: Effort): Effort {
  const ok = modelInfo(model).efforts;
  if (ok.includes(effort)) return effort;
  const lower = EFFORT_IDS.slice(0, EFFORT_IDS.indexOf(effort)).reverse().find((e) => ok.includes(e));
  return lower ?? ok[0];
}

/** `thinking`: return a summary of the model's reasoning with the answer (these models always reason; this only shows it). */
export type LlmOptions = { model: ModelId; effort: Effort; thinking: boolean };

/** What a running generation reports while the user waits: what it is doing now, and its reasoning as it is written. */
export type GenerateProgress = { type: "status"; text: string } | { type: "thinking"; text: string }
  /** The interface as written so far (incomplete, unvalidated): lets the user watch it take shape. */
  | { type: "preview"; spec: unknown };

/** What a generation consumed. `cost` is an estimate at list price (no caching discounts), null when the price is unknown. */
export type GenerateUsage = { inputTokens: number; outputTokens: number; cost: number | null };
export function usageCost(model: ModelId, inputTokens: number, outputTokens: number): number | null {
  const p = modelInfo(model).price;
  return p ? (inputTokens * p[0] + outputTokens * p[1]) / 1_000_000 : null;
}

/** Whether a provider can be used: its key comes from the app's settings ("saved") or the server environment ("env"). */
export type ProviderStatus = { id: ProviderId; configured: boolean; source: "saved" | "env" | null; hint: string | null };

export const DEFAULT_LLM: LlmOptions = { model: "claude-opus-5-5", effort: "medium", thinking: false };
