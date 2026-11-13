import { useEffect, useRef, useState } from "react";
import { DownloadIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import type { AppScope, Query, Scalar } from "@sibilla/shared";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "./api";

type Row = Record<string, Scalar>;
const MAX = 1000; // the most one query returns; also what an export holds
const all = (table: string): Query => ({ table, select: [], join: [], where: [], groupBy: [], aggregates: [], orderBy: [{ field: "id", dir: "desc" }], limit: MAX });

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
const csvCell = (v: Scalar) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (cols: string[], rows: Row[]) => [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c] ?? null)).join(","))].join("\n");

/** The data a mini webapp keeps, collection by collection: look at it, export it, import more, or empty it. */
export function DataDialog({ open, app, onClose, onChange }: { open: boolean; app: AppScope; onClose: () => void; onChange: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* One column that may shrink: without it a wide table stretches the grid past the dialog instead of scrolling. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Dati dell'app</DialogTitle>
          <DialogDescription>Le collezioni in cui questa app salva i suoi dati. Le modifiche valgono subito per chiunque la usi.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={app.collections[0]?.name} className="min-w-0">
          <TabsList>{app.collections.map((c) => <TabsTrigger key={c.name} value={c.name}>{c.name}</TabsTrigger>)}</TabsList>
          {app.collections.map((c) => (
            <TabsContent key={c.name} value={c.name} className="min-w-0"><CollectionData app={app} name={c.name} fields={c.fields.map((f) => f.name)} onChange={onChange} /></TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CollectionData({ app, name, fields, onChange }: { app: AppScope; name: string; fields: string[]; onChange: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const cols = ["id", ...fields, "creato_il"];

  const load = () => api.query(all(name), {}, app).then((r) => { setRows(r.rows); setError(null); }, (e: Error) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [name, app.id]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    try { toast.success(await fn()); await load(); onChange(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  const importFile = (file: File) => run(async () => {
    let docs: unknown;
    try { docs = JSON.parse(await file.text()); } catch { throw new Error("Il file non è un JSON valido"); }
    if (!Array.isArray(docs)) throw new Error("Il file deve contenere un elenco di documenti, come quello esportato");
    const { imported } = await api.importDocs(name, docs as Row[], app);
    return `${imported} documenti importati in ${name}`;
  });

  return (
    <div className="flex min-w-0 flex-col gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground tabular-nums">
          {rows === null ? "Carico…" : rows.length >= MAX ? `Primi ${MAX} documenti` : `${rows.length} documenti`}
        </p>
        <Button variant="outline" size="sm" disabled={!rows?.length} onClick={() => download(`${name}.json`, JSON.stringify(rows, null, 2), "application/json")}><DownloadIcon /> JSON</Button>
        <Button variant="outline" size="sm" disabled={!rows?.length} onClick={() => download(`${name}.csv`, toCsv(cols, rows ?? []), "text/csv")}><DownloadIcon /> CSV</Button>
        <input ref={picker} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => picker.current?.click()}><UploadIcon /> Importa JSON</Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={busy || !rows?.length} />}><Trash2Icon /> Svuota</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Svuotare «{name}»?</AlertDialogTitle>
              <AlertDialogDescription>Tutti i documenti della collezione verranno eliminati. Esportali prima se ti servono: l'operazione non è reversibile.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => run(async () => `${(await api.clearDocs(name, app)).deleted} documenti eliminati da ${name}`)}>Svuota</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : rows && rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nessun documento. Aggiungine dall'app o importa un file JSON.</p>
      ) : (
        <div className="max-h-[50vh] overflow-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {(rows ?? []).slice(0, 200).map((r) => (
                <TableRow key={String(r.id)}>
                  {cols.map((c) => <TableCell key={c} className="max-w-64 truncate whitespace-nowrap">{c === "creato_il" ? String(r[c] ?? "").slice(0, 10) : String(r[c] ?? "")}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {rows && rows.length > 200 && <p className="text-xs text-muted-foreground">Qui vedi i 200 più recenti; l'esportazione li contiene tutti (fino a {MAX}).</p>}
    </div>
  );
}
