import type { DbSchema, LlmOptions, ProviderStatus } from "@sibilla/shared";
import type { Attachment } from "./attachments";
import { Composer } from "./Composer";
import { Orb } from "./Orb";
import { suggestions } from "./suggestions";
import { useCounts } from "./useCounts";

const MODES = [
  { id: "classic", label: "Tutta insieme", hint: "Costruisco l'app completa in una volta." },
  { id: "procedural", label: "Passo per passo", hint: "Parto dalla prima schermata; le altre le genero quando ci entri, e restano." },
] as const;
/** Tables listed before the rest is summed up in one line. Four, like the starters beside them, so the two panels end level. */
const TABLES_SHOWN = 4;

const greeting = (hour = new Date().getHours()) => (hour < 5 || hour >= 18 ? "Buonasera" : hour < 13 ? "Buongiorno" : "Buon pomeriggio");
const number = new Intl.NumberFormat("it-IT");

/**
 * Start of a new conversation. One question ("what do you need?") answered by the composer, which comes first;
 * under it, the two things that help answer it: ways to begin, and the data there is to build on.
 */
export function Home({ mode, onMode, schema, loading, llm, providers, onLlmChange, onProvidersChange, onSend }: {
  mode: "classic" | "procedural";
  onMode: (m: "classic" | "procedural") => void;
  schema: DbSchema | null;
  loading: boolean;
  llm: LlmOptions;
  providers: ProviderStatus[];
  onLlmChange: (patch: Partial<LlmOptions>) => void;
  onProvidersChange: (p: ProviderStatus[]) => void;
  onSend: (prompt: string, attachments?: Attachment[]) => void;
}) {
  const tables = schema?.tables.map((t) => t.name) ?? [];
  const shown = tables.slice(0, TABLES_SHOWN);
  const counts = useCounts(shown);
  const row = "flex w-full items-baseline gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50";

  return (
    <div className="flex min-h-full flex-col justify-center px-4 py-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-center gap-4">
          <Orb className="size-12" />
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{greeting()}, cosa costruiamo?</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Descrivi una schermata o una mini app: la costruisco sui tuoi dati.</p>
          </div>
        </header>

        <div className="flex flex-col gap-2.5">
          <Composer size="hero" autoFocus loading={loading} llm={llm} providers={providers}
            onLlmChange={onLlmChange} onProvidersChange={onProvidersChange} onSend={onSend} />
          {/* How to build belongs with the request it applies to, so it sits against the composer. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm text-muted-foreground">
            <div role="radiogroup" aria-label="Come costruire" className="inline-flex gap-0.5 rounded-full border p-0.5">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => onMode(m.id)}
                  className="rounded-full px-3 py-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-checked:bg-muted aria-checked:font-medium aria-checked:text-foreground">
                  {m.label}
                </button>
              ))}
            </div>
            <span className="min-w-0 basis-full sm:flex-1 sm:basis-0">{MODES.find((m) => m.id === mode)!.hint}</span>
          </div>
        </div>

        {/* Two panels of four rows each: they start and end on the same lines. */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="home-starters" className="overflow-hidden rounded-xl border">
            <h2 id="home-starters" className="px-4 pt-3 pb-1.5 text-sm font-medium">Da dove partire</h2>
            <ul className="divide-y">
              {suggestions(schema).map((s) => (
                <li key={s.prompt}>
                  <button type="button" disabled={loading} onClick={() => onSend(s.prompt)} className={row}>
                    <span className="w-20 shrink-0 font-medium">{s.title}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={s.prompt}>{s.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="home-data" className="flex flex-col overflow-hidden rounded-xl border">
            <h2 id="home-data" className="flex items-baseline gap-2 px-4 pt-3 pb-1.5 text-sm font-medium">
              I tuoi dati
              {tables.length > 0 && <span className="ml-auto text-xs font-normal text-muted-foreground">record</span>}
            </h2>
            {tables.length === 0 ? (
              <p className="px-4 pb-3 text-sm text-muted-foreground">Nessun dato collegato. L'archivio che serve alla tua app lo creo io.</p>
            ) : (
              <ul className="divide-y">
                {shown.map((t) => (
                  <li key={t}>
                    <button type="button" disabled={loading} className={row}
                      onClick={() => onSend(`Una vista su ${t}: i numeri principali e l'elenco con ricerca e filtri`)}>
                      <span className="min-w-0 flex-1 truncate font-medium">{t}</span>
                      {/* A count that could not be read is a dash, never a zero. */}
                      <span className="shrink-0 tabular-nums text-muted-foreground">{t in counts ? number.format(counts[t]) : "–"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {tables.length > shown.length && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">E altre {tables.length - shown.length}: {tables.slice(TABLES_SHOWN).join(", ")}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
