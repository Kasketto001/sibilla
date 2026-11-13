import { ThinkingLevel, type Content, type GoogleGenAI, type Part } from "@google/genai";
import type { Effort } from "@sibilla/shared";
import { TOOLS, type Block, type LlmStep } from "./generate";

type Msg = Parameters<LlmStep>[0]["messages"][number];
const STATE = "provider_state";
/** Prefix of the call ids we make up when Gemini gives none; such ids are not sent back. */
const LOCAL_ID = "gemini_";
const LEVEL: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH, xhigh: ThinkingLevel.XHIGH, max: ThinkingLevel.XHIGH,
};

/** The conversation, kept in Claude's message format by the run, as Gemini contents. */
function toContents(messages: Msg[]): Content[] {
  const out: Content[] = [];
  const names = new Map<string, string>(); // tool call id → function name, needed to answer the call
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }); continue; }
    const blocks = m.content as unknown as Block[];
    if (m.role === "assistant") {
      for (const b of blocks) if (b.type === "tool_use") names.set(String(b.id), String(b.name));
      // A turn this model produced is replayed part by part: thought signatures must come back untouched.
      const state = blocks.find((b) => b.type === STATE && b.provider === "google");
      const parts = state ? state.parts as Part[] : blocks.flatMap((b) => (b.type === "text" ? [{ text: String(b.text) }] : []));
      if (parts.length) out.push({ role: "model", parts });
      continue;
    }
    const parts: Part[] = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const id = String(b.tool_use_id);
        const text = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        parts.push({ functionResponse: {
          ...(id.startsWith(LOCAL_ID) ? {} : { id }), name: names.get(id) ?? "", response: b.is_error ? { error: text } : { output: text },
        } });
      } else if (b.type === "text") parts.push({ text: String(b.text) });
      else if (b.type === "image" || b.type === "document") {
        const s = b.source as { media_type: string; data: string };
        parts.push({ inlineData: { mimeType: s.media_type, data: s.data } });
      }
    }
    if (parts.length) out.push({ role: "user", parts });
  }
  return out;
}

/** One model turn on the Gemini API, reported in the same shape as a Claude turn. */
export function makeGeminiStep(ai: GoogleGenAI): LlmStep {
  return async ({ system, messages, llm, on, signal }) => {
    const stream = await ai.models.generateContentStream({
      model: llm.model,
      contents: toContents(messages),
      config: {
        systemInstruction: system,
        abortSignal: signal,
        maxOutputTokens: 64000,
        tools: [{ functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })) }],
        thinkingConfig: { includeThoughts: llm.thinking, thinkingLevel: LEVEL[llm.effort] },
      },
    });

    const parts: Part[] = [];
    let finish: string | undefined;
    let usage: { input: number; output: number } | undefined;
    for await (const chunk of stream) {
      const c = chunk.candidates?.[0];
      finish = c?.finishReason ?? finish;
      const u = chunk.usageMetadata;
      if (u) usage = { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
      for (const p of c?.content?.parts ?? []) {
        parts.push(p);
        if (p.thought && p.text) on?.thinking(p.text);
        if (p.functionCall?.name) on?.tool(p.functionCall.name);
      }
    }

    const content: Block[] = [];
    const thinking = parts.filter((p) => p.thought && p.text).map((p) => p.text).join("");
    if (thinking) content.push({ type: "thinking", thinking });
    const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
    if (text) content.push({ type: "text", text });
    parts.forEach((p, i) => {
      if (p.functionCall) content.push({ type: "tool_use", id: p.functionCall.id ?? `${LOCAL_ID}${messages.length}_${i}`, name: p.functionCall.name ?? "", input: p.functionCall.args ?? {} });
    });
    const called = content.some((b) => b.type === "tool_use");
    content.push({ type: STATE, provider: "google", parts });
    const refused = !!finish && /SAFETY|PROHIBITED|BLOCKLIST|RECITATION|SPII/.test(finish);
    return { content, stopReason: refused ? "refusal" : called ? "tool_use" : finish === "MAX_TOKENS" ? "max_tokens" : "end_turn", ...(usage ? { usage } : {}) };
  };
}
