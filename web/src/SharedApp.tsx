import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { HOME, screenSpec, type Route, type Spec } from "@sibilla/shared";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { api, setShareToken } from "./api";
import type { Nav } from "./renderer/context";
import { Renderer } from "./renderer/Renderer";
import { styleVars } from "./renderer/style";

/** A mini webapp opened from its public link: just the app, full page, for people who only need to use it. */
export function SharedApp({ token }: { token: string }) {
  const [app, setApp] = useState<{ nome: string; spec: Spec } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trail, setTrail] = useState<Route[]>([{ path: HOME, params: {} }]);
  useEffect(() => {
    setShareToken(token);
    api.getShared(token).then((a) => { setApp(a); document.title = a.nome; }, () => setError("Questo link non è più attivo."));
  }, [token]);

  if (error) return <p className="grid h-svh place-items-center p-6 text-center text-sm text-muted-foreground">{error}</p>;
  if (!app) return <div className="grid h-svh place-items-center"><Spinner /></div>;
  const screen = screenSpec(app.spec, trail.at(-1)!)!;
  // Only the owner, inside Sibilla, can have new screens generated: here links open the ones that already exist.
  const go = (nav: Nav) => {
    const target: Route = { path: nav.to, params: nav.params };
    if (screenSpec(app.spec, target)) setTrail([...trail, target]);
    else toast.info("Questa schermata non è ancora disponibile.");
  };
  const view = styleVars(screen.style);
  return (
    <>
      <div data-view data-font={view.font || undefined} style={view.style} className={`min-h-svh bg-background text-foreground ${view.className}`}>
        <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">
          {trail.length > 1 && (
            <Button variant="ghost" size="sm" className="mb-4" onClick={() => setTrail(trail.slice(0, -1))}><ArrowLeftIcon /> Indietro</Button>
          )}
          <Renderer key={JSON.stringify(screen)} spec={screen} onNavigate={go} />
        </div>
      </div>
      <Toaster richColors />
    </>
  );
}
