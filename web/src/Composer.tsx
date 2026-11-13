import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ArrowUpIcon, CircleStopIcon, FileTextIcon, ImageIcon, MicIcon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { LlmOptions, ProviderStatus } from "@sibilla/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ACCEPT, fileToAttachment, pastedTextAttachment, type Attachment } from "./attachments";
import { LlmSettings } from "./LlmSettings";
import { useDictation } from "./useDictation";

/** Where the user writes to Sibilla: text, dictation, attachments (picked, pasted or dropped) and the model settings. */
export function Composer({ loading, llm, providers = [], onLlmChange, onProvidersChange = () => {}, onSend, onStop, size = "panel", autoFocus, placeholder }: {
  loading: boolean;
  llm: LlmOptions;
  providers?: ProviderStatus[];
  onLlmChange: (patch: Partial<LlmOptions>) => void;
  onProvidersChange?: (p: ProviderStatus[]) => void;
  onSend: (prompt: string, attachments: Attachment[]) => void;
  /** While a generation runs, the send button becomes "stop" and calls this. */
  onStop?: () => void;
  /** "hero": the large composer of the start screen. */
  size?: "panel" | "hero";
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const dictation = useDictation(
    (t) => setText((cur) => (cur.trim() ? `${cur.trimEnd()} ${t}` : t)),
    (msg) => toast.error(msg),
  );

  async function add(list: Iterable<File>) {
    for (const f of list) {
      try {
        const a = await fileToAttachment(f);
        setFiles((cur) => [...cur, a]);
      } catch (e) { toast.error((e as Error).message); }
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = [...e.clipboardData.files];
    if (pasted.length) { e.preventDefault(); add(pasted); return; }
    const long = pastedTextAttachment(e.clipboardData.getData("text/plain"));
    if (long) { e.preventDefault(); setFiles((cur) => [...cur, long]); }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  }

  const send = () => {
    const p = text.trim();
    if ((!p && !files.length) || loading) return;
    if (dictation.listening) dictation.toggle();
    onSend(p || "Usa gli allegati come riferimento.", files);
    setText("");
    setFiles([]);
  };

  const hero = size === "hero";
  return (
    <div
      className="relative"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={onDrop}
    >
      {!!files.length && (
        <ul aria-label="Allegati" className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pr-0.5 pl-2 text-xs">
              {f.mediaType.startsWith("image/") ? <ImageIcon className="size-3.5 shrink-0" /> : <FileTextIcon className="size-3.5 shrink-0" />}
              <span className="truncate">{f.name}</span>
              <Button variant="ghost" size="icon-xs" aria-label={`Rimuovi ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={`border bg-background focus-within:border-ring ${hero ? "rounded-2xl shadow-[0_8px_24px_-12px_rgb(0_0_0/0.12)]" : "rounded-2xl"}`}>
        <Textarea
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={dictation.listening ? "Ti ascolto…" : placeholder ?? (hero ? "Descrivi la schermata o la mini app che ti serve…" : "Cosa ti serve?")}
          aria-label="Messaggio"
          className={`resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 ${hero ? "min-h-28 px-5 pt-4 text-base md:text-base" : "min-h-20"}`}
        />
        <div className={`flex items-center gap-1 ${hero ? "px-3 pb-3" : "px-2 pb-2"}`}>
          <input ref={picker} type="file" multiple accept={ACCEPT} hidden
            onChange={(e) => { add(e.target.files ?? []); e.target.value = ""; }} />
          <Button variant="ghost" size="icon-sm" aria-label="Allega file" onClick={() => picker.current?.click()}><PaperclipIcon /></Button>
          {dictation.supported && (
            <Button
              variant={dictation.listening ? "destructive" : "ghost"} size="icon-sm"
              aria-label={dictation.listening ? "Ferma dettatura" : "Detta"} aria-pressed={dictation.listening}
              onClick={dictation.toggle}
            >
              {dictation.listening ? <SquareIcon /> : <MicIcon />}
            </Button>
          )}
          <LlmSettings llm={llm} providers={providers} onChange={onLlmChange} onProvidersChange={onProvidersChange} />
          {loading && onStop ? (
            <Button size={hero ? "icon" : "icon-sm"} variant="secondary" className="ml-auto shrink-0" onClick={onStop} aria-label="Ferma">
              <CircleStopIcon />
            </Button>
          ) : (
            <Button size={hero ? "icon" : "icon-sm"} className="ml-auto shrink-0" onClick={send} disabled={loading || (!text.trim() && !files.length)} aria-label="Invia">
              <ArrowUpIcon />
            </Button>
          )}
        </div>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-3xl border-2 border-dashed border-primary bg-background/90 text-sm font-medium">
          Rilascia per allegare
        </div>
      )}
    </div>
  );
}
