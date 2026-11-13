import { useEffect, useRef, useState } from "react";
import { PanelRightCloseIcon } from "lucide-react";
import type { GenerateUsage, LlmOptions, ProviderStatus, Spec } from "@sibilla/shared";
import { Button } from "@/components/ui/button";
import type { Attachment } from "./attachments";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";
import { Orb } from "./Orb";

/** `thinking`: the model's reasoning for this answer, shown on request. `usage`: what producing it consumed. */
export type ChatMessage = { role: "user" | "assistant"; content: string; attachments?: string[]; thinking?: string; usage?: GenerateUsage };

/** Live state of the running generation: what Sibilla is doing, its reasoning so far, and the interface as built so far. */
export type Progress = { status: string; thinking: string; preview: Spec | null };

const tokens = new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 });
const dollars = new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });
/** "12,4 mila token, circa 0,08 $": the cost is an estimate at list price. */
const usageLine = (u: GenerateUsage) =>
  `${tokens.format(u.inputTokens + u.outputTokens)} token${u.cost === null ? "" : `, circa ${dollars.format(u.cost)}`}`;

/** Seconds since the generation started, so a long wait visibly moves. */
function Elapsed() {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  return <span className="tabular-nums">{s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`}</span>;
}

export function Chat({ history, loading, progress, llm, providers = [], onLlmChange, onProvidersChange = () => {}, onSend, onStop, onClose, variant = "panel" }: {
  history: ChatMessage[];
  loading: boolean;
  progress?: Progress | null;
  llm: LlmOptions;
  onLlmChange: (patch: Partial<LlmOptions>) => void;
  providers?: ProviderStatus[];
  onProvidersChange?: (p: ProviderStatus[]) => void;
  onSend: (prompt: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  onClose?: () => void;
  /** "panel": beside the interface it builds. "page": the whole screen, while the conversation has no interface yet. */
  variant?: "panel" | "page";
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: "smooth" }); }, [history.length, loading, progress?.status, progress?.thinking]);
  const page = variant === "page";
  const column = page ? "mx-auto w-full max-w-3xl" : "";

  return (
    <aside aria-label="Chat con Sibilla" className={`flex h-full min-h-0 w-full flex-col ${page ? "" : "border-l bg-muted/30"}`}>
      {!page && (
        <div className="flex items-start gap-2 border-b px-4 py-3">
          <div className="flex-1">
            <h2 className="font-heading text-sm font-semibold">Chiedi a Sibilla</h2>
            <p className="text-xs text-muted-foreground">Chiedi una modifica, un'altra schermata o un dato.</p>
          </div>
          {onClose && <Button variant="ghost" size="icon-sm" aria-label="Chiudi chat" onClick={onClose}><PanelRightCloseIcon /></Button>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className={`space-y-3 p-4 ${column} ${page ? "py-8" : ""}`}>
          {history.map((m, i) => (
            <div
              key={i}
              className={m.role === "user"
                ? `rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground ${page ? "ml-auto w-fit max-w-[80%]" : "ml-8"}`
                : `text-sm ${page ? "" : "mr-4"}`}
            >
              {m.thinking && (
                <details className="mb-2 rounded-lg border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium select-none">Ragionamento</summary>
                  <div className="mt-2"><Markdown text={m.thinking} /></div>
                </details>
              )}
              {m.role === "assistant" ? <Markdown text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
              {!!m.attachments?.length && (
                <p className="mt-1 text-xs opacity-80">{m.attachments.join(", ")}</p>
              )}
              {m.usage && <p className="mt-1 text-xs text-muted-foreground tabular-nums">{usageLine(m.usage)}</p>}
            </div>
          ))}
          {loading && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground" role="status">
              {progress?.thinking.trim() && (
                <div className="rounded-lg border bg-background/60 px-3 py-2 text-xs">
                  <p className="mb-1 font-medium">Ragionamento</p>
                  <Markdown text={progress.thinking} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Orb className="size-5" /> <span className="flex-1">{progress?.status || "Sibilla sta lavorando…"}</span> <Elapsed />
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
      </div>

      <div className={`p-3 ${page ? `${column} pb-6` : "border-t"}`}>
        <Composer loading={loading} llm={llm} providers={providers} onLlmChange={onLlmChange} onProvidersChange={onProvidersChange} onSend={onSend} onStop={onStop} autoFocus={page} />
      </div>
    </aside>
  );
}
