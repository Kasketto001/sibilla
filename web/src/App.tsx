import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, HouseIcon, LayoutDashboardIcon, MessageSquareIcon, PanelLeftOpenIcon } from "lucide-react";
import { toast } from "sonner";
import { HOME, partialSpec, screenSpec, withScreen, type Route, type DbSchema, type InterfaceDetail, type InterfaceSummary, type ProviderStatus, type Spec } from "@sibilla/shared";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { api } from "./api";
import type { Attachment } from "./attachments";
import { CanvasHeader } from "./CanvasHeader";
import { DataDialog } from "./DataDialog";
import { DatabaseView } from "./DatabaseView";
import { resetSchemaCache } from "./renderer/form";
import { useCounts } from "./useCounts";
import { useIsMobile } from "./useIsMobile";
import { Chat, type ChatMessage, type Progress } from "./Chat";
import { Home } from "./Home";
import { InterfacesSidebar } from "./InterfacesSidebar";
import { useLlmSettings } from "./useLlmSettings";
import { Orb } from "./Orb";
import type { Nav } from "./renderer/context";
import { Renderer } from "./renderer/Renderer";
import { styleVars } from "./renderer/style";

/** The open conversation. `version`/`savedSpec` are null until it has produced an interface. */
type Current = { detail: InterfaceDetail; version: number | null; savedSpec: Spec | null };
/** Past messages sent to the model as context (the full chat stays visible and stored). */
const MODEL_HISTORY = 20;

/** Name of a conversation until its first interface gives it a title. */
const titleOf = (prompt: string) => {
  const t = prompt.replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 47).trimEnd()}…` : t;
};

export default function App() {
  const [list, setList] = useState<InterfaceSummary[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  /** The whole app of the open conversation: its first screen plus the ones generated so far. */
  const [spec, setSpec] = useState<Spec | null>(null);
  /** The screen being looked at, and the ones passed through to get there (for "back"). */
  const [route, setRoute] = useState<Route>({ path: HOME, params: {} });
  const [trail, setTrail] = useState<Route[]>([]);
  /** How new conversations are built: all at once, or one screen at a time as the user explores. */
  const [mode, setMode] = useState<"classic" | "procedural">("classic");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const mobile = useIsMobile();
  // On a phone the sidebar covers the page, so it starts closed; the chat and the interface take turns.
  const [navOpen, setNavOpen] = useState(!mobile);
  const [chatOpen, setChatOpen] = useState(true);
  const [dataOpen, setDataOpen] = useState(false);
  /** Bumped when the app's data is changed from outside the interface (import, empty): the interface reloads it. */
  const [dataEpoch, setDataEpoch] = useState(0);
  const [schema, setSchema] = useState<DbSchema | null>(null);
  /** The database screen, when it is showing instead of a conversation: which table (null = the form for a new one). */
  const [db, setDb] = useState<{ table: string | null } | null>(null);
  /** Bumped when rows or tables may have changed, so counts are read again. */
  const [dbEpoch, setDbEpoch] = useState(0);
  const tables = schema?.tables.map((t) => t.name) ?? [];
  const counts = useCounts(tables, dbEpoch);
  const [llm, setLlm] = useLlmSettings();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  // Bumped whenever the screen switches conversation: late generation results for the old one stay out of the screen.
  const epoch = useRef(0);
  /** Stops the generation on screen. */
  const stopper = useRef<AbortController | null>(null);

  const fail = (e: unknown) => toast.error((e as Error).message);
  const reloadList = () => Promise.resolve(api.listInterfaces()).then((l) => setList(l ?? []), fail);
  useEffect(() => {
    reloadList();
    Promise.resolve(api.schema()).then((s) => setSchema(s ?? null), () => setSchema(null));
    Promise.resolve(api.providers()).then((p) => setProviders(p ?? []), () => setProviders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The database changed (from its screen, or because Sibilla created tables or rows): everything that shows it catches up. */
  const databaseChanged = (next?: DbSchema) => {
    resetSchemaCache();
    setDbEpoch((n) => n + 1);
    if (next) setSchema(next);
    else Promise.resolve(api.schema()).then((s) => s && setSchema(s), () => {});
  };

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { fail(e); } finally { setBusy(false); }
  }

  /**
   * One exchange with Sibilla. Normally a request typed in the chat, about the screen on view.
   * With `nav`, the user followed a link to a screen that doesn't exist yet: it is generated now, shown, and kept.
   * `fresh` starts a new conversation with it, whatever is open.
   */
  async function send(prompt: string, attachments: Attachment[] = [], nav?: Nav, fresh = false) {
    if (fresh) reset();
    if (!nav) setChatOpen(true);
    const origin: Route = fresh ? { path: HOME, params: {} } : route;
    const at: Route = nav ? { path: nav.to, params: nav.params } : route;
    if (nav) { setTrail((t) => [...t, origin]); setRoute(at); }
    const question: ChatMessage = { role: "user", content: nav ? `Apri «${prompt}»` : prompt, attachments: attachments.map((a) => a.name) };
    setHistory((h) => [...h, question]);
    setLoading(true);
    setProgress(null);
    const started = epoch.current;
    const here = () => started === epoch.current;
    const app = fresh ? null : spec;
    // The model works on one screen at a time: the one on view, or the one the link was on.
    const currentSpec = app ? screenSpec(app, origin) : null;
    const context = (fresh ? [] : history).slice(-MODEL_HISTORY).map(({ role, content }) => ({ role, content }));

    // A conversation is saved the moment it starts: it shows up in the sidebar and survives a reload.
    let id = fresh ? null : current?.detail.id ?? null;
    const untitled = fresh || !current || current.detail.latestVersion === null; // its first interface will name it
    let questionStored = false;
    if (id === null) {
      try {
        const detail = await api.createInterface({ nome: titleOf(prompt), descrizione: null, spec: null, prompt: null, messages: [question] });
        if (detail) {
          id = detail.id;
          questionStored = true;
          if (here()) setCurrent({ detail, version: null, savedSpec: null });
          reloadList();
        }
      } catch { toast.error("Non sono riuscita a salvare la conversazione"); }
    }

    let answer: ChatMessage;
    let made: Spec | null = null;
    const stop = new AbortController();
    stopper.current = stop;
    try {
      const res = await api.generate({
        prompt, currentSpec, attachments, llm, history: nav ? [] : context,
        mode: app?.procedural ? "procedural" : mode,
        ...(nav ? { navigate: {
          from: origin.path, to: nav.to, label: nav.label, intent: nav.intent, params: nav.params,
          routes: [{ path: HOME, title: app?.title ?? "" }, ...(app?.screens ?? []).map(({ path, title }) => ({ path, title }))],
        } } : {}),
      }, (p) => {
        if (!here()) return;
        setProgress((cur) => {
          const c = cur ?? { status: "", thinking: "", preview: null };
          return p.type === "status" ? { ...c, status: p.text }
            : p.type === "thinking" ? { ...c, thinking: c.thinking + p.text }
            : { ...c, preview: partialSpec(p.spec) ?? c.preview };
        });
      }, stop.signal);
      made = res.spec;
      answer = {
        role: "assistant", content: res.message,
        ...(res.thinking ? { thinking: res.thinking } : {}), ...(res.usage ? { usage: res.usage } : {}),
      };
    } catch (e) {
      const stopped = (e as Error).name === "AbortError";
      if (here() && !stopped) fail(e);
      answer = { role: "assistant", content: stopped ? "Interrotta." : `Non ci sono riuscita: ${(e as Error).message}` };
    }
    databaseChanged(); // Sibilla may have created tables or rows along the way
    // The new screen takes its place in the app; the rest of the app is untouched.
    const merged = made ? withScreen(app, at.path, made, nav ? answer.content : undefined) : null;
    if (here()) {
      setLoading(false);
      if (merged) { setSpec(merged); if (mobile) setChatOpen(false); } // on a phone, show what was just built
      else if (nav) { setRoute(origin); setTrail((t) => t.slice(0, -1)); } // nothing to show there: back where the link was
      setHistory((h) => [...h, answer]);
    }
    if (id === null) return;

    // Stored with its conversation even if the user has moved to another one meanwhile.
    try {
      const reply = answer;
      await api.appendMessages(id, questionStored ? [reply] : [question, reply]);
      if (merged) {
        let detail = await api.addVersion(id, { spec: merged, prompt: question.content });
        if (detail && untitled) detail = await api.renameInterface(id, { nome: merged.title }) ?? detail;
        if (detail && here()) setCurrent({ detail, version: detail.latestVersion, savedSpec: merged });
      }
      reloadList();
    } catch { toast.error("Non sono riuscita a salvare la conversazione"); }
  }

  const load = (id: number, version?: number) => act(async () => {
    const detail = await api.getInterface(id);
    const n = version ?? detail.latestVersion;
    const v = n === null ? null : await api.getVersion(id, n);
    setCurrent({ detail, version: v?.numero ?? null, savedSpec: v?.spec ?? null });
    setSpec(v?.spec ?? null);
    setRoute({ path: HOME, params: {} });
    setTrail([]);
  });

  /** A link was followed. A screen that already exists just opens: only a new one is generated. */
  const go = (nav: Nav) => {
    if (!spec || loading) return;
    const target: Route = { path: nav.to, params: nav.params };
    if (screenSpec(spec, target)) { setTrail((t) => [...t, route]); setRoute(target); } else send(nav.label, [], nav);
  };
  const back = () => { const prev = trail.at(-1); if (prev) { setRoute(prev); setTrail(trail.slice(0, -1)); } };
  const home = () => { setRoute({ path: HOME, params: {} }); setTrail([]); };

  const open = (id: number) => {
    setDb(null);
    if (mobile) { setNavOpen(false); setChatOpen(false); }
    epoch.current++; setLoading(false); setProgress(null); setHistory([]);
    const opened = epoch.current;
    api.listMessages(id).then(
      (m) => opened === epoch.current && setHistory(m.map(({ createdAt: _, ...msg }) => msg)),
      () => toast.error("Non sono riuscita a caricare la chat"),
    );
    return load(id);
  };

  const reset = () => {
    setDb(null);
    if (mobile) setNavOpen(false);
    epoch.current++; setLoading(false); setProgress(null); setCurrent(null); setSpec(null); setHistory([]); home();
  };

  /** Makes the version on screen the latest again, as a new version (nothing is overwritten). */
  const restore = () => act(async () => {
    if (!current?.savedSpec) return;
    const detail = await api.addVersion(current.detail.id, { spec: current.savedSpec, prompt: null });
    setCurrent({ detail, version: detail.latestVersion, savedSpec: current.savedSpec });
    toast.success(`Ripristinata come versione ${detail.latestVersion}`);
    await reloadList();
  });

  const rename = (nome: string) => act(async () => {
    if (!current) return;
    const detail = await api.renameInterface(current.detail.id, { nome });
    setCurrent({ ...current, detail });
    await reloadList();
  });

  /** Pin, archive or share: changes to the conversation itself, not to its content. */
  const change = (fn: (id: number) => Promise<InterfaceDetail>) => act(async () => {
    if (!current) return;
    const detail = await fn(current.detail.id);
    setCurrent({ ...current, detail });
    await reloadList();
  });

  const remove = () => act(async () => {
    if (!current) return;
    await api.deleteInterface(current.detail.id);
    toast.success(`«${current.detail.nome}» eliminata`);
    reset();
    await reloadList();
  });

  // Three screens: the start of a new conversation, a conversation that is only chat so far, and an interface with its chat beside it.
  const start = !db && !current && !spec && history.length === 0 && !loading;
  // While Sibilla writes an interface, the canvas shows it taking shape (structure only, no data yet).
  const preview = loading ? progress?.preview ?? null : null;
  const screen = spec ? screenSpec(spec, route) : null;
  const shown = preview ?? screen;
  const split = !db && (!!spec || !!preview);
  const view = styleVars(shown?.style);
  const appScope = spec?.appId && spec.collections?.length ? { id: spec.appId, collections: spec.collections } : null;
  // Phone: one column. The sidebar slides over it, and an interface and its chat are shown one at a time.
  const chatOnly = mobile && split && chatOpen;
  const cols = mobile ? "minmax(0,1fr)" : `${navOpen ? "16rem" : "0"} minmax(0,1fr) ${split && chatOpen ? "minmax(20rem,26rem)" : "0"}`;
  const chat = (variant: "panel" | "page") => (
    <Chat variant={variant} history={history} loading={loading} progress={progress} llm={llm} onLlmChange={setLlm}
      providers={providers} onProvidersChange={setProviders} onSend={send} onStop={() => stopper.current?.abort()} onClose={() => setChatOpen(false)} />
  );

  return (
    <>
    <div className="grid h-svh bg-background text-foreground transition-[grid-template-columns] duration-200 motion-reduce:transition-none"
      style={{ gridTemplateColumns: cols }}>
      <div className={mobile ? `fixed inset-0 z-40 ${navOpen ? "" : "hidden"}` : "min-w-0 overflow-hidden"}>
        {mobile && <button type="button" aria-label="Chiudi" className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />}
        {navOpen && (
          <div className={mobile ? "relative h-full w-64 bg-background shadow-xl" : "h-full"}>
            <InterfacesSidebar list={list} currentId={current?.detail.id ?? null} onOpen={open} onNew={reset} onClose={() => setNavOpen(false)}
              tables={tables} counts={counts} dbOpen={!!db} table={db?.table ?? null}
              onOpenTable={(t) => { setDb({ table: t }); if (mobile) setNavOpen(false); }}
              onNewTable={() => { setDb({ table: null }); if (mobile) setNavOpen(false); }} />
          </div>
        )}
      </div>

      <main className="relative flex min-h-0 min-w-0 flex-col">
        {!navOpen && (
          <Button variant="ghost" size="icon-sm" className="absolute top-3.5 left-3 z-10" aria-label="Mostra conversazioni" onClick={() => setNavOpen(true)}>
            <PanelLeftOpenIcon />
          </Button>
        )}
        {!start && !db && (
          <div className={`flex items-center border-b ${navOpen ? "" : "pl-10"}`}>
            <div className="min-w-0 flex-1">
              <CanvasHeader
                title={(shown?.title || current?.detail.nome) ?? "Nuova conversazione"}
                detail={current?.detail ?? null}
                version={current?.version ?? null}
                busy={busy}
                onSelectVersion={(n) => current && load(current.detail.id, n)}
                onRestore={restore}
                onRename={rename}
                onDelete={remove}
                hasData={!!appScope}
                onData={() => setDataOpen(true)}
                onPin={(pinned) => change((id) => api.renameInterface(id, { pinned }))}
                onArchive={(archived) => change((id) => api.renameInterface(id, { archived }))}
                onShare={(shared) => change((id) => api.setShared(id, shared))}
              />
            </div>
            {split && !chatOpen && (
              <Button variant="outline" size="sm" className="mr-3" aria-label="Chiedi a Sibilla" onClick={() => setChatOpen(true)}>
                <MessageSquareIcon /> <span className="hidden sm:inline">Chiedi a Sibilla</span>
              </Button>
            )}
            {chatOnly && (
              <Button variant="outline" size="sm" className="mr-3" onClick={() => setChatOpen(false)}>
                <LayoutDashboardIcon /> Vedi
              </Button>
            )}
          </div>
        )}

        {split && route.path !== HOME && (
          <div className="flex items-center gap-1 border-b px-3 py-1.5 text-sm">
            <Button variant="ghost" size="sm" disabled={!trail.length || loading} onClick={back}><ArrowLeftIcon /> Indietro</Button>
            <Button variant="ghost" size="icon-sm" aria-label="Schermata iniziale" title="Schermata iniziale" disabled={loading} onClick={home}><HouseIcon /></Button>
            <span className="truncate px-2 text-muted-foreground">{screen?.title ?? "Nuova schermata"}</span>
          </div>
        )}

        {db ? (
          <div className={`min-h-0 flex-1 ${navOpen ? "" : "pt-10"}`}>
            <DatabaseView schema={schema} table={db.table} loading={loading} llm={llm} providers={providers} onLlmChange={setLlm} onProvidersChange={setProviders}
              onSelect={(t) => setDb({ table: t })} onSchema={databaseChanged}
              onAsk={(prompt, attachments) => send(prompt, attachments, undefined, true)} />
          </div>
        ) : start ? (
          <div className="flex-1 overflow-y-auto">
            <Home mode={mode} onMode={setMode} schema={schema} loading={loading} llm={llm} providers={providers} onLlmChange={setLlm} onProvidersChange={setProviders} onSend={send} />
          </div>
        ) : chatOnly ? <div className="min-h-0 flex-1">{chat("page")}</div> : split ? (
          <div data-view data-font={view.font || undefined} style={view.style}
            className={`flex-1 overflow-y-auto bg-background text-foreground ${view.className}`}>
            <div className="mx-auto w-full max-w-[1400px] p-6 lg:p-8">
              {preview ? <Renderer spec={preview} preview />
                : screen ? <Renderer key={`${dataEpoch}:${JSON.stringify(screen)}`} spec={screen} onAskFix={(p) => send(p)} onNavigate={go} />
                : (
                  // A link led to a screen that doesn't exist yet: it is being written right now.
                  <div role="status" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center text-sm text-muted-foreground">
                    <Orb className="size-16" />
                    {loading ? (progress?.status || "Genero questa schermata…") : "Questa schermata non è stata generata."}
                  </div>
                )}
            </div>
          </div>
        ) : <div className="min-h-0 flex-1">{chat("page")}</div>}
      </main>

      {!mobile && (
        <div className="min-h-0 min-w-0 overflow-hidden">
          {split && chatOpen && chat("panel")}
        </div>
      )}
    </div>
    {appScope && <DataDialog open={dataOpen} app={appScope} onClose={() => setDataOpen(false)} onChange={() => setDataEpoch((n) => n + 1)} />}
    <Toaster richColors />
    </>
  );
}
