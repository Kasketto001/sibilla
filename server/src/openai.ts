import type OpenAI from "openai";
import type { ResponseInputItem, ResponseInputMessageContentList } from "openai/resources/responses/responses";
import { TOOLS, type Block, type LlmStep } from "./generate";

type Msg = Parameters<LlmStep>[0]["messages"][number];
const STATE = "provider_state";

/** The conversation, kept in Claude's message format by the run, as Responses API input items. */
function toInput(messages: Msg[]): ResponseInputItem[] {
  const out: ResponseInputItem[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    const blocks = m.content as unknown as Block[];
    if (m.role === "assistant") {
      // A turn this model produced is replayed exactly (reasoning items included), as the API asks for stateless use.
      const state = blocks.find((b) => b.type === STATE && b.provider === "openai");
      if (state) out.push(...(state.items as ResponseInputItem[]));
      else {
        const text = blocks.flatMap((b) => (b.type === "text" ? [String(b.text)] : [])).join("");
        if (text) out.push({ role: "assistant", content: text });
      }
      continue;
    }
    const content: ResponseInputMessageContentList = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        out.push({ type: "function_call_output", call_id: String(b.tool_use_id), output: typeof b.content === "string" ? b.content : JSON.stringify(b.content) });
      } else if (b.type === "text") content.push({ type: "input_text", text: String(b.text) });
      else if (b.type === "image" || b.type === "document") {
        const s = b.source as { media_type: string; data: string };
        const url = `data:${s.media_type};base64,${s.data}`;
        content.push(b.type === "image"
          ? { type: "input_image", image_url: url, detail: "auto" }
          : { type: "input_file", filename: typeof b.title === "string" ? b.title : "documento.pdf", file_data: url });
      }
    }
    if (content.length) out.push({ role: "user", content });
  }
  return out;
}

const parse = (json: string): unknown => { try { return JSON.parse(json); } catch { return null; } }; // null fails tool validation: the model retries

/** One model turn on OpenAI's Responses API, reported in the same shape as a Claude turn. */
export function makeOpenAIStep(client: OpenAI): LlmStep {
  return async ({ system, messages, llm, on, signal }) => {
    const stream = client.responses.stream({
      model: llm.model,
      instructions: system,
      input: toInput(messages),
      store: false,
      max_output_tokens: 64000,
      reasoning: { effort: llm.effort, ...(llm.thinking ? { summary: "auto" as const } : {}) },
      tools: TOOLS.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.input_schema, strict: false })),
    }, { signal });
    if (on) {
      stream.on("response.reasoning_summary_text.delta", (e) => on.thinking(e.delta));
      stream.on("response.output_item.added", (e) => { if (e.item.type === "function_call") on.tool(e.item.name); });
    }
    const res = await stream.finalResponse();

    const content: Block[] = [];
    let refused = false;
    for (const item of res.output) {
      if (item.type === "reasoning") {
        const thinking = item.summary.map((s) => s.text).join("\n\n");
        if (thinking) content.push({ type: "thinking", thinking });
      } else if (item.type === "message") {
        for (const part of item.content) {
          if (part.type === "output_text") content.push({ type: "text", text: part.text });
          else if (part.type === "refusal") refused = true;
        }
      } else if (item.type === "function_call") {
        content.push({ type: "tool_use", id: item.call_id, name: item.name, input: parse(item.arguments) });
      }
    }
    const called = content.some((b) => b.type === "tool_use");
    content.push({ type: STATE, provider: "openai", items: res.output });
    return {
      content, stopReason: refused ? "refusal" : called ? "tool_use" : res.status === "incomplete" ? "max_tokens" : "end_turn",
      ...(res.usage ? { usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } } : {}),
    };
  };
}
