import { useState, type FormEvent } from "react";
import { CheckCircle2Icon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { PROVIDERS, type ProviderId, type ProviderStatus } from "@sibilla/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "./api";
import { ProviderIcon } from "./ProviderIcon";

/** Where the user connects each model provider by pasting its API key. The server checks the key before saving it. */
export function AccessDialog({ open, providers, onClose, onChange }: {
  open: boolean; providers: ProviderStatus[]; onClose: () => void; onChange: (p: ProviderStatus[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Accesso ai modelli</DialogTitle>
          <DialogDescription>
            Incolla la chiave API di ogni fornitore che vuoi usare. Le chiavi restano sul server di Sibilla e non vengono più mostrate.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-5">
          {PROVIDERS.map((p) => (
            <ProviderRow key={p.id} id={p.id} status={providers.find((s) => s.id === p.id)} onChange={onChange} />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function ProviderRow({ id, status, onChange }: { id: ProviderId; status?: ProviderStatus; onChange: (p: ProviderStatus[]) => void }) {
  const p = PROVIDERS.find((x) => x.id === id)!;
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<ProviderStatus[]>, done: string) {
    setBusy(true);
    setError(null);
    try { onChange(await fn()); setKey(""); toast.success(done); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const save = (e: FormEvent) => { e.preventDefault(); if (key.trim()) run(() => api.saveProviderKey(id, key.trim()), `${p.label} collegato`); };

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ProviderIcon provider={id} />
        <span className="font-medium">{p.label}</span>
        <span className="text-xs text-muted-foreground">{p.company}</span>
        {status?.configured
          ? <Badge variant="secondary" className="ml-auto"><CheckCircle2Icon /> Collegato {status.hint}{status.source === "env" ? " (dal server)" : ""}</Badge>
          : <Badge variant="outline" className="ml-auto">Non collegato</Badge>}
      </div>
      <form onSubmit={save} className="flex gap-2">
        <Input
          type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} aria-invalid={!!error}
          aria-label={`Chiave API ${p.label}`} placeholder={status?.configured ? "Sostituisci la chiave…" : "Incolla la chiave API…"}
        />
        <Button type="submit" disabled={busy || !key.trim()}>{busy && <Spinner />}Salva</Button>
        {status?.source === "saved" && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => api.removeProviderKey(id), `Chiave ${p.label} rimossa`)}>Rimuovi</Button>
        )}
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <a href={p.keysUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground underline-offset-4 hover:underline">
        Crea una chiave su {p.company} <ExternalLinkIcon className="size-3" />
      </a>
    </li>
  );
}
