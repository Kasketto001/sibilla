import { useState, type FormEvent } from "react";
import {
  ArchiveIcon, ArchiveRestoreIcon, CheckIcon, CopyIcon, DatabaseIcon, PencilIcon, PinIcon, PinOffIcon, RotateCcwIcon, Share2Icon, Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import type { InterfaceDetail } from "@sibilla/shared";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function NameDialog({ open, title, initial, onClose, onSubmit }: {
  open: boolean; title: string; initial: string; onClose: () => void; onSubmit: (nome: string) => void;
}) {
  const [nome, setNome] = useState(initial);
  const submit = (e: FormEvent) => { e.preventDefault(); if (nome.trim()) onSubmit(nome.trim()); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nome-interfaccia">Nome</FieldLabel>
              <Input id="nome-interfaccia" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter><Button type="submit" disabled={!nome.trim()}>Salva</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Public link to the conversation's app: on/off, and the address to pass on. */
function ShareControl({ detail, busy, onShare }: { detail: InterfaceDetail; busy: boolean; onShare: (shared: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const url = detail.shareToken ? `${location.origin}/?app=${detail.shareToken}` : "";
  const copy = () => navigator.clipboard.writeText(url).then(
    () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
    () => toast.error("Non sono riuscita a copiare: seleziona il link e copialo a mano"),
  );
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" aria-label="Condividi" />}><Share2Icon /> <span className="hidden sm:inline">Condividi</span></PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="share-on">Link pubblico</FieldLabel>
            <Switch id="share-on" checked={!!detail.shareToken} disabled={busy} onCheckedChange={onShare} />
          </Field>
          {detail.shareToken ? (
            <>
              <div className="flex gap-2">
                <Input readOnly value={url} aria-label="Link dell'app" onFocus={(e) => e.target.select()} />
                <Button variant="outline" size="icon" aria-label="Copia link" onClick={copy}>{copied ? <CheckIcon /> : <CopyIcon />}</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Chi ha il link apre solo l'app, senza account, e può usarne i dati. Vede sempre l'ultima versione. Spegnendo l'interruttore il link smette di funzionare.
              </p>
            </>
          ) : <p className="text-xs text-muted-foreground">Crea un link per far usare questa app a chi non ha Sibilla.</p>}
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}

/** Title bar of the open conversation. Everything is saved automatically: each generated interface is a new version. */
export function CanvasHeader({ title, detail, version, busy, hasData, onSelectVersion, onRestore, onRename, onDelete, onPin, onArchive, onShare, onData }: {
  title: string;
  detail: InterfaceDetail | null;
  version: number | null;
  busy: boolean;
  /** The interface on screen keeps its own data (a mini webapp): offer to manage it. */
  hasData?: boolean;
  onSelectVersion: (n: number) => void;
  onRestore: () => void;
  onRename: (nome: string) => void;
  onDelete: () => void;
  onPin?: (pinned: boolean) => void;
  onArchive?: (archived: boolean) => void;
  onShare?: (shared: boolean) => void;
  onData?: () => void;
}) {
  const [naming, setNaming] = useState(false);
  const viewingOld = !!detail && version !== null && version !== detail.latestVersion;
  const versions = detail?.versions.map((v) => ({ value: String(v.numero), label: `Versione ${v.numero}` })) ?? [];

  return (
    <header className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
      <div className="flex min-w-[7rem] flex-1 items-center gap-1">
        <h1 className="truncate font-heading text-lg font-semibold">{detail?.nome ?? title}</h1>
        {detail && (
          <Button variant="ghost" size="icon-sm" aria-label="Rinomina" onClick={() => setNaming(true)}><PencilIcon /></Button>
        )}
        {detail && onPin && (
          <Button variant="ghost" size="icon-sm" aria-pressed={detail.pinned} aria-label={detail.pinned ? "Non fissare più" : "Fissa in alto"}
            title={detail.pinned ? "Non fissare più" : "Fissa in alto"} onClick={() => onPin(!detail.pinned)}>
            {detail.pinned ? <PinOffIcon /> : <PinIcon />}
          </Button>
        )}
      </div>

      {detail && version !== null && detail.versions.length > 1 && (
        <Select items={versions} value={String(version)} onValueChange={(v) => v && onSelectVersion(Number(v))}>
          <SelectTrigger aria-label="Versione" size="sm" className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {versions.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {viewingOld && <Button size="sm" onClick={onRestore} disabled={busy}><RotateCcwIcon /> Ripristina questa versione</Button>}
      {detail && hasData && onData && <Button variant="outline" size="sm" aria-label="Dati" onClick={onData}><DatabaseIcon /> <span className="hidden sm:inline">Dati</span></Button>}
      {detail && version !== null && onShare && <ShareControl detail={detail} busy={busy} onShare={onShare} />}
      {detail && onArchive && (
        <Button variant="outline" size="icon-sm" disabled={busy} aria-label={detail.archived ? "Togli dall'archivio" : "Archivia"}
          title={detail.archived ? "Togli dall'archivio" : "Archivia"} onClick={() => onArchive(!detail.archived)}>
          {detail.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        </Button>
      )}

      {detail && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="icon-sm" disabled={busy} aria-label="Elimina" title="Elimina" />}><Trash2Icon /></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare «{detail.nome}»?</AlertDialogTitle>
              <AlertDialogDescription>Verranno eliminati la conversazione, le sue {detail.versions.length} versioni e i dati inseriti nelle collezioni di questa app. L'operazione non è reversibile.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>Elimina</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {naming && (
        <NameDialog
          open
          title="Rinomina"
          initial={detail?.nome ?? ""}
          onClose={() => setNaming(false)}
          onSubmit={(nome) => { setNaming(false); onRename(nome); }}
        />
      )}
    </header>
  );
}
