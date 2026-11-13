import { useEffect, useState, type FormEvent } from "react";
import { DownloadIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { Column, DbSchema, LlmOptions, ProviderStatus, Query, Scalar } from "@sibilla/shared";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, api, type ColumnDef } from "./api";
import type { Attachment } from "./attachments";
import { Composer } from "./Composer";

type Row = Record<string, Scalar>;
type Table = DbSchema["tables"][number];
const SHOWN = 200;
const TYPES = [
  { value: "text", label: "Testo" }, { value: "number", label: "Numero" }, { value: "integer", label: "Intero" },
  { value: "boolean", label: "Sì / No" }, { value: "date", label: "Data" },
] as const;
const NONE = "__nessuna__";
const number = new Intl.NumberFormat("it-IT");
const blank = (): ColumnDef => ({ name: "", type: "text", required: false, references: null });
const editable = (t: Table) => t.columns.filter((c) => !c.pk && !c.generated);

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
const csvCell = (v: Scalar) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/**
 * The database, table by table: look at the rows, add, change and delete them, add columns, create and drop tables.
 * The same can be asked in words: the box at the bottom starts a conversation with Sibilla.
 */
export function DatabaseView({ schema, table, loading, llm, providers, onLlmChange, onProvidersChange, onSelect, onSchema, onAsk }: {
  schema: DbSchema | null;
  /** The table on view; null = the form that creates a new one. */
  table: string | null;
  loading: boolean;
  llm: LlmOptions;
  providers: ProviderStatus[];
  onLlmChange: (patch: Partial<LlmOptions>) => void;
  onProvidersChange: (p: ProviderStatus[]) => void;
  onSelect: (table: string | null) => void;
  /** The database changed shape or content. */
  onSchema: (schema?: DbSchema) => void;
  onAsk: (prompt: string, attachments: Attachment[]) => void;
}) {
  const t = table ? schema?.tables.find((x) => x.name === table) : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8">
          {t ? <TableData key={t.name} table={t} tables={schema!.tables} onSchema={onSchema} onSelect={onSelect} />
            : <NewTable tables={schema?.tables ?? []} onCreated={(s, name) => { onSchema(s); onSelect(name); }} />}
        </div>
      </div>
      <div className="border-t">
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-3 pb-5 sm:px-8">
        <Composer loading={loading} llm={llm} providers={providers} onLlmChange={onLlmChange} onProvidersChange={onProvidersChange} onSend={onAsk}
          placeholder={t ? `Chiedi a Sibilla: «aggiungi 20 righe di esempio a ${t.name}», «crea una tabella fornitori»…` : "Oppure descrivila a Sibilla: «una tabella fornitori con nome, email e città, con 10 esempi»"} />
      </div>
      </div>
    </div>
  );
}

function TableData({ table, tables, onSchema, onSelect }: {
  table: Table; tables: Table[]; onSchema: (s?: DbSchema) => void; onSelect: (t: string | null) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [adding, setAdding] = useState(false);
  const pk = table.columns.find((c) => c.pk)?.name ?? "id";
  const base: Query = { table: table.name, select: [], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: SHOWN };

  const load = () => Promise.all([
    api.query({ ...base, orderBy: [{ field: pk, dir: "desc" }] }, {}),
    api.query({ ...base, aggregates: [{ fn: "count", field: "*", as: "n" }], limit: 1 }, {}),
  ]).then(([r, c]) => { setRows(r.rows); setTotal(Number(c.rows[0]?.n ?? 0)); setError(null); }, (e: Error) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [table.name, table.columns.length]);
  const changed = () => { load(); onSchema(); };

  const drop = () => api.dropTable(table.name).then(
    (s) => { toast.success(`Tabella ${table.name} eliminata`); onSchema(s); onSelect(s.tables[0]?.name ?? null); },
    (e: Error) => toast.error(e.message),
  );
  const exportCsv = () => {
    const cols = table.columns.map((c) => c.name);
    download(`${table.name}.csv`, [cols.join(","), ...(rows ?? []).map((r) => cols.map((c) => csvCell(r[c] ?? null)).join(","))].join("\n"));
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">{table.name}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {total === null ? "Carico…" : `${number.format(total)} record`}, {table.columns.length} colonne
            {total !== null && total > SHOWN ? `. Qui i ${SHOWN} più recenti.` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}><PlusIcon /> Colonna</Button>
        <Button variant="outline" size="sm" disabled={!rows?.length} onClick={exportCsv}><DownloadIcon /> CSV</Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" />}><Trash2Icon /> Elimina tabella</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare la tabella «{table.name}»?</AlertDialogTitle>
              <AlertDialogDescription>
                Verranno eliminati la tabella e i suoi {total === null ? "" : number.format(total)} record. Le viste che la usano smetteranno di funzionare. L'operazione non è reversibile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={drop}>Elimina tabella</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button size="sm" onClick={() => setEditing("new")}><PlusIcon /> Aggiungi riga</Button>
      </header>

      {error ? <p className="text-sm text-destructive">{error}</p> : rows && rows.length === 0 ? (
        <p className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
          Nessun record in {table.name}. Aggiungi la prima riga, o chiedi a Sibilla qui sotto di caricare dei dati.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {table.columns.map((c) => (
                  <TableHead key={c.name} className={c.type === "text" ? "" : "text-right"}>
                    {c.name}{c.references && <span className="font-normal text-muted-foreground"> → {c.references.table}</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={String(r[pk])} className="cursor-pointer" onClick={() => setEditing(r)}>
                  {table.columns.map((c) => (
                    <TableCell key={c.name} className={`max-w-72 truncate whitespace-nowrap ${c.type === "text" ? "" : "text-right tabular-nums"}`}>
                      {r[c.name] === null || r[c.name] === undefined ? <span className="text-muted-foreground">–</span> : String(r[c.name])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && <RowDialog table={table} pk={pk} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); changed(); }} />}
      {adding && (
        <Dialog open onOpenChange={(o) => { if (!o) setAdding(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuova colonna in {table.name}</DialogTitle>
              <DialogDescription>Le righe esistenti l'avranno vuota.</DialogDescription>
            </DialogHeader>
            <ColumnsForm tables={tables} single submitLabel="Aggiungi colonna" canRequire={false}
              onSubmit={async ([col]) => { onSchema(await api.addColumn(table.name, col)); toast.success(`Colonna ${col.name} aggiunta`); setAdding(false); }} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Add or edit one row: a field per column, named and typed as in the table. */
function RowDialog({ table, pk, row, onClose, onDone }: { table: Table; pk: string; row: Row | null; onClose: () => void; onDone: () => void }) {
  const cols = editable(table);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(cols.map((c) => [c.name, row?.[c.name] == null ? "" : String(row[c.name])])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true); setErrors({}); setFormError(null);
    try { await fn(); toast.success(done); onDone(); }
    catch (e) {
      const fe = e instanceof ApiError ? e.fieldErrors ?? {} : {};
      setErrors(fe);
      if (!Object.keys(fe).length) setFormError((e as Error).message);
    } finally { setBusy(false); }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Row = Object.fromEntries(cols.map((c) => [c.name, values[c.name].trim() === "" ? null : values[c.name]]));
    run(() => (row ? api.updateRecord(table.name, Number(row[pk]), payload) : api.createRecord(table.name, payload)), row ? "Riga salvata" : "Riga aggiunta");
  };
  const hint = (c: Column) => (c.references ? `id di ${c.references.table}` : c.type === "integer" ? "numero intero" : c.type === "real" ? "numero" : undefined);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{row ? `${table.name} n. ${row[pk]}` : `Nuova riga in ${table.name}`}</DialogTitle></DialogHeader>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            {cols.map((c) => (
              <Field key={c.name} data-invalid={!!errors[c.name] || undefined}>
                <FieldLabel htmlFor={`col-${c.name}`}>{c.name}{c.notNull && !c.hasDefault && <span aria-hidden className="text-destructive">*</span>}</FieldLabel>
                <Input id={`col-${c.name}`} aria-invalid={!!errors[c.name]} inputMode={c.type === "text" ? undefined : "decimal"} placeholder={hint(c)}
                  value={values[c.name]} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))} />
                <FieldError>{errors[c.name]}</FieldError>
              </Field>
            ))}
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex items-center justify-between gap-2">
              <Button type="submit" disabled={busy}>{row ? "Salva" : "Aggiungi riga"}</Button>
              {row && <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => api.deleteRecord(table.name, Number(row[pk])), "Riga eliminata")}>Elimina riga</Button>}
            </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewTable({ tables, onCreated }: { tables: Table[]; onCreated: (s: DbSchema, name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Nuova tabella</h1>
        <p className="text-sm text-muted-foreground">Ogni tabella ha già un id numerico automatico: aggiungi solo le tue colonne.</p>
      </header>
      <Field>
        <FieldLabel htmlFor="table-name">Nome della tabella</FieldLabel>
        <Input id="table-name" autoFocus placeholder="es. fornitori" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_"))} className="max-w-sm" />
      </Field>
      <ColumnsForm tables={tables} submitLabel="Crea tabella" canRequire disabled={!name.trim()}
        onSubmit={async (columns) => { const s = await api.createTable({ name: name.trim(), columns }); toast.success(`Tabella ${name.trim()} creata`); onCreated(s, name.trim()); }} />
    </div>
  );
}

/** The columns of a table to create (or the one column to add): name, type, whether it is required, what it points to. */
function ColumnsForm({ tables, single, submitLabel, canRequire, disabled, onSubmit }: {
  tables: Table[]; single?: boolean; submitLabel: string; canRequire: boolean; disabled?: boolean; onSubmit: (columns: ColumnDef[]) => Promise<void>;
}) {
  const [cols, setCols] = useState<ColumnDef[]>([blank()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<ColumnDef>) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const refs = [{ value: NONE, label: "Non collegata" }, ...tables.map((t) => ({ value: t.name, label: `Punta a ${t.name}` }))];
  const filled = cols.filter((c) => c.name.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await onSubmit(filled.map((c) => ({ ...c, name: c.name.trim(), type: c.references ? "integer" : c.type }))); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {cols.map((c, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-2">
            <Input aria-label={`Nome colonna ${i + 1}`} placeholder="nome_colonna" value={c.name}
              onChange={(e) => set(i, { name: e.target.value.toLowerCase().replace(/\s+/g, "_") })} />
            <Select items={TYPES} value={c.references ? "integer" : c.type} disabled={!!c.references} onValueChange={(v) => v && set(i, { type: v as ColumnDef["type"] })}>
              <SelectTrigger aria-label={`Tipo colonna ${i + 1}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select items={refs} value={c.references ?? NONE} onValueChange={(v) => set(i, { references: !v || v === NONE ? null : String(v) })}>
              <SelectTrigger aria-label={`Colonna ${i + 1} punta a`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{refs.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            {canRequire ? (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={c.required} onCheckedChange={(v) => set(i, { required: v })} aria-label={`Colonna ${i + 1} obbligatoria`} /> Obbligatoria
              </label>
            ) : <span />}
            {single ? <span /> : (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Togli colonna ${i + 1}`} disabled={cols.length === 1} onClick={() => setCols((cs) => cs.filter((_, j) => j !== i))}><XIcon /></Button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        {!single && <Button type="button" variant="outline" size="sm" onClick={() => setCols((cs) => [...cs, blank()])}><PlusIcon /> Altra colonna</Button>}
        <Button type="submit" size="sm" disabled={busy || disabled || !filled.length}>{submitLabel}</Button>
      </div>
    </form>
  );
}
