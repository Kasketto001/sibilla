import { expect, test } from "vitest";
import type OpenAI from "openai";
import type { GoogleGenAI } from "@google/genai";
import { makeOpenAIStep } from "../src/openai";
import { makeGeminiStep } from "../src/gemini";
import type { LlmStep } from "../src/generate";

type Args = Parameters<LlmStep>[0];
const llm = { model: "gpt-6.1-sol", effort: "high", thinking: true } as const;
const user = (content: unknown) => ({ role: "user", content }) as Args["messages"][number];
const assistant = (content: unknown) => ({ role: "assistant", content }) as Args["messages"][number];
const firstTurn = [
  user("ciao"), assistant("Ciao!"),
  user([
    { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
    { type: "document", title: "brief.pdf", source: { type: "base64", media_type: "application/pdf", data: "BBBB" } },
    { type: "text", text: "quanti ordini?" },
  ]),
];

test("OpenAI: a turn is sent as Responses input and comes back as Claude-shaped blocks, then replays verbatim", async () => {
  const sent: Record<string, unknown>[] = [];
  const output = [
    { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Devo contare." }], encrypted_content: "xyz" },
    { type: "function_call", id: "fc_1", call_id: "call_1", name: "esegui_query", arguments: '{"query":{"table":"ordini"}}' },
  ];
  const client = { responses: { stream: (params: Record<string, unknown>) => {
    sent.push(params);
    const handlers: Record<string, (e: unknown) => void> = {};
    return {
      on(ev: string, fn: (e: unknown) => void) { handlers[ev] = fn; return this; },
      async finalResponse() {
        handlers["response.reasoning_summary_text.delta"]?.({ delta: "Devo contare." });
        handlers["response.output_item.added"]?.({ item: output[1] });
        return { output, status: "completed" };
      },
    };
  } } } as unknown as OpenAI;
  const step = makeOpenAIStep(client);
  const seen: string[] = [];
  const on = { thinking: (d: string) => seen.push(`think:${d}`), tool: (n: string) => seen.push(`tool:${n}`) };

  const r = await step({ system: "SYS", messages: firstTurn, llm, on });
  expect(sent[0]).toMatchObject({ model: "gpt-6.1-sol", instructions: "SYS", store: false, reasoning: { effort: "high", summary: "auto" } });
  expect((sent[0].tools as { type: string; name: string }[]).map((t) => `${t.type}:${t.name}`)).toContain("function:mostra_interfaccia");
  expect(sent[0].input).toEqual([
    { role: "user", content: "ciao" }, { role: "assistant", content: "Ciao!" },
    { role: "user", content: [
      { type: "input_image", image_url: "data:image/png;base64,AAAA", detail: "auto" },
      { type: "input_file", filename: "brief.pdf", file_data: "data:application/pdf;base64,BBBB" },
      { type: "input_text", text: "quanti ordini?" },
    ] },
  ]);
  expect(r.stopReason).toBe("tool_use");
  expect(r.content.slice(0, 2)).toEqual([
    { type: "thinking", thinking: "Devo contare." },
    { type: "tool_use", id: "call_1", name: "esegui_query", input: { query: { table: "ordini" } } },
  ]);
  expect(seen).toEqual(["think:Devo contare.", "tool:esegui_query"]);

  await step({ system: "SYS", llm, messages: [...firstTurn, assistant(r.content), user([{ type: "tool_result", tool_use_id: "call_1", content: "300 righe" }])] });
  expect((sent[1].input as unknown[]).slice(3)).toEqual([...output, { type: "function_call_output", call_id: "call_1", output: "300 righe" }]);
});

test("Gemini: parts map to Claude-shaped blocks and are replayed with their signatures; tool results name the function", async () => {
  const sent: Record<string, unknown>[] = [];
  const parts = [
    { text: "Devo contare.", thought: true },
    { functionCall: { name: "esegui_query", args: { query: { table: "ordini" } } }, thoughtSignature: "sig" },
  ];
  const ai = { models: { generateContentStream: async (params: Record<string, unknown>) => {
    sent.push(params);
    return (async function* () {
      yield { candidates: [{ content: { parts: [parts[0]] } }] };
      yield { candidates: [{ content: { parts: [parts[1]] }, finishReason: "STOP" }] };
    })();
  } } } as unknown as GoogleGenAI;
  const step = makeGeminiStep(ai);
  const g = { model: "gemini-4-carbon", effort: "high", thinking: true } as const;

  const r = await step({ system: "SYS", messages: firstTurn, llm: g });
  expect(sent[0]).toMatchObject({ model: "gemini-4-carbon", config: { systemInstruction: "SYS", thinkingConfig: { includeThoughts: true, thinkingLevel: "HIGH" } } });
  expect(sent[0].contents).toEqual([
    { role: "user", parts: [{ text: "ciao" }] }, { role: "model", parts: [{ text: "Ciao!" }] },
    { role: "user", parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }, { inlineData: { mimeType: "application/pdf", data: "BBBB" } }, { text: "quanti ordini?" }] },
  ]);
  expect(r.stopReason).toBe("tool_use");
  const call = r.content[1] as unknown as { id: string };
  expect(r.content.slice(0, 2)).toEqual([
    { type: "thinking", thinking: "Devo contare." },
    { type: "tool_use", id: call.id, name: "esegui_query", input: { query: { table: "ordini" } } },
  ]);

  await step({ system: "SYS", llm: g, messages: [...firstTurn, assistant(r.content), user([{ type: "tool_result", tool_use_id: call.id, content: "boom", is_error: true }])] });
  expect((sent[1].contents as unknown[]).slice(3)).toEqual([
    { role: "model", parts },
    { role: "user", parts: [{ functionResponse: { name: "esegui_query", response: { error: "boom" } } }] },
  ]);
});
