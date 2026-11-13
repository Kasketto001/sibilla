import { useEffect, useRef, useState } from "react";
import { AlertCircleIcon, WandSparklesIcon } from "lucide-react";
import type { NodeOf, Scalar } from "@sibilla/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "../api";
import { useRender } from "./context";
import { buildSandbox, handleBridge } from "./sandbox";
import { Loading } from "./states";

const THEME_VARS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground",
  "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive",
  "border", "input", "ring", "radius", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
];

/** The theme as it applies where the node sits (brand + any spec style overrides), as CSS declarations. */
function themeAt(el: Element): { css: string; dark: boolean } {
  const cs = getComputedStyle(el);
  const css = THEME_VARS.map((v) => [v, cs.getPropertyValue(`--${v}`).trim()] as const)
    .filter(([, val]) => val).map(([v, val]) => `--${v}: ${val};`).join(" ");
  return { css, dark: !!el.closest(".dark, .light")?.classList.contains("dark") };
}

export function CustomNode({ node }: { node: NodeOf<"custom"> }) {
  const { onAskFix, refresh, data, navigate } = useRender();
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [compiled, setCompiled] = useState<{ hash: string } | { error: string } | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [height, setHeight] = useState(node.height ?? 160);
  const [theme, setTheme] = useState<{ css: string; dark: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    setCompiled(null);
    api.bundle(node.source, node.libraries, node.stylesheets)
      .then((r) => live && setCompiled(r), (e: Error) => live && setCompiled({ error: e.message }));
    return () => { live = false; };
  }, [node.source, node.libraries, node.stylesheets]);

  useEffect(() => { if (box.current) setTheme(themeAt(box.current)); }, []);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win || !e.data || typeof e.data !== "object") return;
      const d = e.data as { sibilla?: string; id?: number; op?: string; args?: unknown[]; height?: number; message?: string };
      if (d.sibilla === "height" && node.height == null && typeof d.height === "number") setHeight(Math.min(Math.max(d.height, 40), 4000));
      if (d.sibilla === "error") setRuntimeError(d.message ?? "Errore sconosciuto");
      if (d.sibilla === "request" && d.op === "navigate") {
        // A link followed from custom code: [route, parameters, what the screen is for].
        const [to, params, intent] = d.args ?? [];
        navigate?.({ to: String(to), params: (params ?? {}) as Record<string, Scalar>, intent: String(intent ?? ""), label: String(to) });
        win.postMessage({ sibilla: "response", id: d.id, result: null }, "*");
      } else if (d.sibilla === "request") {
        try {
          const result = await handleBridge(data as never, String(d.op), d.args ?? []);
          win.postMessage({ sibilla: "response", id: d.id, result }, "*");
          if (d.op !== "query") refresh(); // writes from custom code update the standard nodes too
        } catch (err) {
          win.postMessage({ sibilla: "response", id: d.id, error: (err as Error).message }, "*");
        }
      }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [node.height, refresh, data, navigate]);

  const error = compiled && "error" in compiled ? compiled.error : runtimeError;

  return (
    <div ref={box} className="flex min-w-0 flex-col gap-2">
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Questa vista personalizzata ha un errore</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span className="break-words">{error}</span>
            {onAskFix && (
              <Button size="sm" variant="outline" onClick={() => onAskFix(`La vista personalizzata «${node.id}» dà questo errore, correggila: ${error}`)}>
                <WandSparklesIcon /> Chiedi a Sibilla di correggere
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {!compiled || !theme ? (
        <div className="flex flex-col gap-2">
          <Loading className="h-40" />
          <p className="text-xs text-muted-foreground">Preparo la vista e le sue librerie. La prima volta che si usa una libreria può servire un minuto.</p>
        </div>
      ) : "hash" in compiled && (
        <iframe
          ref={frame}
          title="Vista personalizzata"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          srcDoc={buildSandbox({ hash: compiled.hash, origin: location.origin, themeCss: theme.css, dark: theme.dark })}
          style={{ height }}
          className="w-full rounded-lg border-0 bg-transparent"
        />
      )}
    </div>
  );
}
