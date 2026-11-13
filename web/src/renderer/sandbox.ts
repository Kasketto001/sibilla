/**
 * Sandbox for "custom" nodes: a srcdoc iframe (no allow-same-origin → opaque origin, no access to the app).
 * Everything it runs comes from our server: the view bundle (built with its own npm libraries) and Tailwind.
 * Data only through the "sibilla" postMessage bridge bundled into the view.
 * The frame declares the same color-scheme as the page around it: otherwise its transparent background is painted white.
 */

// Classic script, runs even when the bundle fails to load: reports resources that don't load and a view that never starts.
const WATCHDOG = `
addEventListener("error", (e) => {
  const t = e.target;
  if (t && t !== window && (t.src || t.href))
    parent.postMessage({ sibilla: "error", message: "Impossibile caricare " + (t.src || t.href) }, "*");
}, true);
setTimeout(() => {
  if (!window.__sibillaReady)
    parent.postMessage({ sibilla: "error", message: "La vista non si è avviata entro 20 secondi." }, "*");
}, 20000);
`;

const TAILWIND_THEME = `@theme inline {
  --color-background: var(--background); --color-foreground: var(--foreground);
  --color-card: var(--card); --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover); --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary); --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary); --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted); --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent); --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive); --color-border: var(--border); --color-input: var(--input); --color-ring: var(--ring);
  --color-chart-1: var(--chart-1); --color-chart-2: var(--chart-2); --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4); --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) * 0.6); --radius-md: calc(var(--radius) * 0.8); --radius-lg: var(--radius); --radius-xl: calc(var(--radius) * 1.4);
  --font-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
}`;

const csp = (origin: string) => [
  "default-src 'none'",
  `script-src 'unsafe-inline' ${origin}`,
  `style-src 'unsafe-inline' ${origin} https://fonts.googleapis.com`,
  `font-src data: ${origin} https://fonts.gstatic.com`,
  // ponytail: any https image (placeholders, logos); tighten to an allow-list if exfiltration via images matters.
  "img-src data: blob: https:",
  "media-src data: blob: https:",
  "connect-src 'none'",
].join("; ");

export function buildSandbox(o: { hash: string; origin: string; themeCss: string; dark?: boolean }): string {
  const base = `${o.origin}/api`;
  return `<!doctype html>
<html lang="it" class="${o.dark ? "dark" : ""}"><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp(o.origin)}">
<script>${WATCHDOG}</script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>:root { color-scheme: ${o.dark ? "dark" : "light"}; ${o.themeCss.replace(/[<{}]/g, "")} } html, body { margin: 0; background: transparent; color: var(--foreground); font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif; } #root { min-height: 1px; }</style>
<script src="${base}/runtime/tailwind.js"></script>
<style type="text/tailwindcss">${TAILWIND_THEME}</style>
<link rel="stylesheet" href="${base}/bundle/${o.hash}.css">
</head><body><div id="root"></div>
<script type="module" src="${base}/bundle/${o.hash}.js"></script>
</body></html>`;
}

type Api = {
  query: (q: never, vars: never) => Promise<unknown>;
  createRecord: (t: never, v: never) => Promise<unknown>;
  updateRecord: (t: never, id: never, v: never) => Promise<unknown>;
  deleteRecord: (t: never, id: never) => Promise<unknown>;
};
const OPS = new Set(["query", "createRecord", "updateRecord", "deleteRecord"]);

/** Executes a sandbox request. Only data operations are reachable from custom code. */
export function handleBridge(api: Api, op: string, args: unknown[]): Promise<unknown> {
  if (!OPS.has(op) || !Array.isArray(args)) return Promise.reject(new Error(`Operazione non consentita: ${op}`));
  // Only the declared arguments: the app scope is added by the host, never taken from custom code.
  return (api[op as keyof Api] as (...a: unknown[]) => Promise<unknown>)(...args.slice(0, op === "updateRecord" ? 3 : 2));
}
