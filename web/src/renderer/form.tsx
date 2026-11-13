import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { withCollections, type Column, type DbSchema, type NodeOf, type Query, type Scalar } from "@sibilla/shared";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api } from "../api";
import { useRender } from "./context";
import { Loading, NodeError } from "./states";
import { useOptions } from "./options";
import { useSpecQuery } from "./useSpecQuery";
import { Children } from "./Renderer";

// The schema is fetched once and shared by every form; resetSchemaCache() drops it when the database changes.
let schemaPromise: Promise<DbSchema> | null = null;
/** Forget the cached schema: tables were created, changed or dropped. */
export const resetSchemaCache = () => { schemaPromise = null; };
const loadSchema = () => (schemaPromise ??= api.schema().catch((e) => { schemaPromise = null; throw e; }));

/** The database schema plus the collections of the spec being rendered. */
function useSchema() {
  const { collections } = useRender();
  const [s, setS] = useState<{ schema: DbSchema | null; error: string | null }>({ schema: null, error: null });
  useEffect(() => {
    let live = true;
    loadSchema().then((schema) => live && setS({ schema, error: null }), (e: Error) => live && setS({ schema: null, error: e.message }));
    return () => { live = false; };
  }, []);
  const schema = useMemo(() => s.schema && withCollections(s.schema, collections), [s.schema, collections]);
  return { schema, error: s.error };
}

const CloseCtx = createContext<(() => void) | null>(null);

export function DialogNode({ node }: { node: NodeOf<"dialog"> }) {
  const { vars, setVar } = useRender();
  const [localOpen, setLocalOpen] = useState(false);
  const open = node.openVariable ? vars[node.openVariable] != null : localOpen;
  const setOpen = (o: boolean) => {
    if (node.openVariable) { if (!o) setVar(node.openVariable, null); } else setLocalOpen(o);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {node.triggerLabel && (
        <DialogTrigger render={<Button className="self-start" />}>{node.triggerLabel}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{node.title}</DialogTitle></DialogHeader>
        <CloseCtx.Provider value={() => setOpen(false)}>
          <div className="flex flex-col gap-4"><Children id={node.id} /></div>
        </CloseCtx.Provider>
      </DialogContent>
    </Dialog>
  );
}

type Values = Record<string, Scalar>;
const isEmpty = (v: Scalar | undefined) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export function FormNode({ node }: { node: NodeOf<"form"> }) {
  const { schema, error: schemaError } = useSchema();
  const { vars } = useRender();
  const table = schema?.tables.find((t) => t.name === node.table);
  const pk = table?.columns.find((c) => c.pk)?.name ?? "id";
  const id = node.mode === "edit" && node.recordIdVariable ? vars[node.recordIdVariable] : null;

  const recordQuery: Query | null = node.mode === "edit" && table && id != null ? {
    table: node.table, select: [pk, ...node.fields.map((f) => f.column)], join: [],
    where: [{ field: pk, op: "eq", value: id }], groupBy: [], aggregates: [], orderBy: [], limit: 1,
  } : null;
  const record = useSpecQuery(recordQuery);

  if (schemaError) return <NodeError message={schemaError} />;
  if (!schema) return <Loading className="h-40" />;
  if (!table) return <NodeError message={`Tabella sconosciuta: ${node.table}`} />;
  if (node.mode === "edit" && id == null) return <p className="text-sm text-muted-foreground">Seleziona un record da modificare.</p>;
  if (record.error) return <NodeError message={record.error} />;
  // A stale record belongs to another id: never prefill from it.
  if (record.loading || (recordQuery && record.stale && record.rows?.[0]?.[pk] !== id)) return <Loading className="h-40" />;
  if (node.mode === "edit" && !record.rows?.length) return <NodeError message="Record non trovato" />;

  return <FormBody key={String(id)} node={node} columns={table.columns} id={id} initial={record.rows?.[0] ?? {}} />;
}

function FormBody({ node, columns, id, initial }: { node: NodeOf<"form">; columns: Column[]; id: Scalar; initial: Values }) {
  const { refresh, data, setVar } = useRender();
  const close = useContext(CloseCtx);
  const blank = () => Object.fromEntries(node.fields.map((f) => [f.column, initial[f.column] ?? (f.input === "switch" ? false : "")]));
  const [values, setValues] = useState<Values>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const col = (name: string) => columns.find((c) => c.name === name);
  const required = (name: string) => { const c = col(name); return !!c && c.notNull && !c.hasDefault && !c.pk; };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    for (const f of node.fields) if (required(f.column) && isEmpty(values[f.column])) local[f.column] = "Campo obbligatorio";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    const payload: Values = {};
    for (const f of node.fields) {
      const v = values[f.column];
      payload[f.column] = typeof v === "string" ? (v.trim() === "" ? null : v) : v;
    }
    setSaving(true);
    try {
      if (node.mode === "edit") await data.updateRecord(node.table, Number(id), payload);
      else await data.createRecord(node.table, payload);
      toast.success("Salvato");
      if (node.mode === "create") setValues(Object.fromEntries(node.fields.map((f) => [f.column, f.input === "switch" ? false : ""])));
      close?.();
      refresh();
    } catch (err) {
      const fe = err instanceof ApiError ? err.fieldErrors ?? {} : {};
      const shown = new Set(node.fields.map((f) => f.column));
      const hidden = Object.entries(fe).filter(([k]) => !shown.has(k));
      setErrors(fe);
      if (!Object.keys(fe).length) setFormError((err as Error).message);
      else if (hidden.length) setFormError(hidden.map(([k, m]) => `${k}: ${m}`).join("; "));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setFormError(null);
    try {
      await data.deleteRecord(node.table, Number(id));
      toast.success("Eliminato");
      close?.();
      if (node.recordIdVariable) setVar(node.recordIdVariable, null);
      refresh();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: string, v: Scalar) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        {node.fields.map((f) => {
          const fid = `${node.id}-${f.column}`;
          const v = values[f.column];
          const invalid = !!errors[f.column];
          return (
            <Field key={f.column} data-invalid={invalid || undefined} orientation={f.input === "switch" ? "horizontal" : "vertical"}>
              <FieldLabel htmlFor={fid}>{f.label}{required(f.column) && <span aria-hidden className="text-destructive">*</span>}</FieldLabel>
              {f.input === "textarea" ? (
                <Textarea id={fid} aria-invalid={invalid} value={String(v ?? "")} onChange={(e) => set(f.column, e.target.value)} />
              ) : f.input === "switch" ? (
                <Switch id={fid} checked={v === true || v === 1} onCheckedChange={(c) => set(f.column, c)} />
              ) : f.input === "select" ? (
                <OptionsSelect id={fid} field={f} value={v} invalid={invalid} onChange={(x) => set(f.column, x)} />
              ) : (
                <Input
                  id={fid} aria-invalid={invalid}
                  type={f.input === "number" ? "number" : f.input === "date" ? "date" : "text"}
                  value={String(v ?? "")}
                  onChange={(e) => set(f.column, e.target.value)}
                />
              )}
              <FieldError>{errors[f.column]}</FieldError>
            </Field>
          );
        })}
        {formError && <NodeError message={formError} />}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="submit" disabled={saving}>
            {saving && <Spinner />}{node.submitLabel}
          </Button>
          {node.mode === "edit" && node.allowDelete && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={saving} />}>Elimina</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare questo record?</AlertDialogTitle>
                  <AlertDialogDescription>L'operazione non è reversibile.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={remove}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}

function OptionsSelect({ id, field, value, invalid, onChange }: {
  id: string; field: NodeOf<"form">["fields"][number]; value: Scalar; invalid: boolean; onChange: (v: Scalar) => void;
}) {
  const { options, loading } = useOptions(field);
  const items = options.map(({ value, label }) => ({ value, label }));
  return (
    <Select
      items={items}
      value={isEmpty(value) ? null : String(value)}
      onValueChange={(v) => {
        const hit = options.find((o) => o.value === v);
        onChange(hit ? hit.raw : (v as string | null));
      }}
    >
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
        <SelectValue placeholder={loading ? "Caricamento…" : "Seleziona…"} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
