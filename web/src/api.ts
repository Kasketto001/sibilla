import type {
  AppScope, ChatMessage, DbSchema, GenerateProgress, GenerateUsage, LlmOptions, ProviderId, ProviderStatus, InterfaceDetail, StoredMessage, InterfaceSummary, InterfaceVersion, Query, Scalar, Spec,
} from "@sibilla/shared";
import type { Attachment } from "./attachments";

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type Row = Record<string, Scalar>;
/** A column of a table to create: its name, what it holds, and the table it points to (by id), if any. */
export type ColumnDef = { name: string; type: "text" | "number" | "integer" | "boolean" | "date"; required: boolean; references: string | null };
export type TableDef = { name: string; columns: ColumnDef[] };
export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Set on a page opened from a public app link: its data requests carry the link's token instead of a session. */
let shareToken: string | null = null;
export const setShareToken = (token: string | null) => { shareToken = token; };

export type Account = { id: number; email: string };
export type Session = { enabled: boolean; user: Account | null; signup: boolean };

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${url}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(shareToken ? { "x-sibilla-share": shareToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 204) return undefined as T;
  const data = await r.json().catch(() => ({ error: `Errore ${r.status}` }));
  if (!r.ok) throw new ApiError(r.status, data.error ?? `Errore ${r.status}`, data.fieldErrors);
  return data as T;
}

type GenerateInput = {
  prompt: string; currentSpec: Spec | null; history: ChatTurn[]; attachments?: Attachment[]; llm?: LlmOptions;
  mode?: "classic" | "procedural";
  /** Generate the screen a link leads to (see the server's Navigation). */
  navigate?: { from: string; to: string; label: string; intent: string; params: Record<string, Scalar>; routes: { path: string; title: string }[] };
};
type GenerateResult = { spec: Spec | null; message: string; thinking?: string; usage?: GenerateUsage };
type GenerateLine = GenerateProgress | { type: "result"; result: GenerateResult }
  | { type: "error"; status: number; error: string; fieldErrors?: Record<string, string> };

/**
 * Runs a generation, reporting progress as it arrives (one JSON object per line), and resolves with the final result.
 * Aborting `signal` stops it (the server cancels the model call) and rejects with an AbortError.
 */
async function generate(input: GenerateInput, onProgress?: (p: GenerateProgress) => void, signal?: AbortSignal): Promise<GenerateResult> {
  const r = await fetch("/api/generate/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
  if (!r.ok || !r.body) {
    const data = await r.json().catch(() => ({ error: `Errore ${r.status}` }));
    throw new ApiError(r.status, data.error ?? `Errore ${r.status}`);
  }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as GenerateLine;
      if (msg.type === "result") return msg.result;
      if (msg.type === "error") throw new ApiError(msg.status, msg.error, msg.fieldErrors);
      onProgress?.(msg);
    }
    if (done) throw new ApiError(502, "La connessione si è interrotta prima della risposta, riprova");
  }
}

export const api = {
  schema: () => req<DbSchema>("GET", "/schema"),
  query: (query: Query, vars: Record<string, Scalar>, app?: AppScope) => req<{ rows: Row[] }>("POST", "/query", { query, vars, app }),
  createRecord: (table: string, values: Row, app?: AppScope) => req<Row>("POST", `/records/${encodeURIComponent(table)}`, { values, app }),
  updateRecord: (table: string, id: number, values: Row, app?: AppScope) =>
    req<Row>("PATCH", `/records/${encodeURIComponent(table)}/${id}`, { values, app }),
  deleteRecord: (table: string, id: number, app?: AppScope) =>
    req<void>("DELETE", `/records/${encodeURIComponent(table)}/${id}`, { app }),
  generate,
  createTable: (def: TableDef) => req<DbSchema>("POST", "/tables", def),
  addColumn: (table: string, column: ColumnDef) => req<DbSchema>("POST", `/tables/${encodeURIComponent(table)}/columns`, column),
  dropTable: (table: string) => req<DbSchema>("DELETE", `/tables/${encodeURIComponent(table)}`),
  providers: () => req<ProviderStatus[]>("GET", "/providers"),
  saveProviderKey: (id: ProviderId, apiKey: string) => req<ProviderStatus[]>("PUT", `/providers/${id}`, { apiKey }),
  removeProviderKey: (id: ProviderId) => req<ProviderStatus[]>("DELETE", `/providers/${id}`),
  bundle: (source: string, libraries: string[], stylesheets: string[]) =>
    req<{ hash: string }>("POST", "/bundle", { source, libraries, stylesheets }),
  listInterfaces: () => req<InterfaceSummary[]>("GET", "/interfaces"),
  getInterface: (id: number) => req<InterfaceDetail>("GET", `/interfaces/${id}`),
  getVersion: (id: number, n: number) => req<InterfaceVersion>("GET", `/interfaces/${id}/versions/${n}`),
  createInterface: (b: { nome: string; descrizione?: string | null; spec: Spec | null; prompt: string | null; messages?: ChatMessage[] }) =>
    req<InterfaceDetail>("POST", "/interfaces", b),
  listMessages: (id: number) => req<StoredMessage[]>("GET", `/interfaces/${id}/messages`),
  appendMessages: (id: number, messages: ChatMessage[]) => req<void>("POST", `/interfaces/${id}/messages`, { messages }),
  addVersion: (id: number, b: { spec: Spec; prompt: string | null }) =>
    req<InterfaceDetail>("POST", `/interfaces/${id}/versions`, b),
  importDocs: (collection: string, documents: Row[], app: AppScope) =>
    req<{ imported: number }>("POST", `/data/${encodeURIComponent(collection)}/import`, { app, documents }),
  clearDocs: (collection: string, app: AppScope) => req<{ deleted: number }>("DELETE", `/data/${encodeURIComponent(collection)}`, { app }),
  renameInterface: (id: number, b: { nome?: string; descrizione?: string | null; pinned?: boolean; archived?: boolean }) =>
    req<InterfaceDetail>("PATCH", `/interfaces/${id}`, b),
  deleteInterface: (id: number) => req<void>("DELETE", `/interfaces/${id}`),
  setShared: (id: number, shared: boolean) => req<InterfaceDetail>("PUT", `/interfaces/${id}/share`, { shared }),
  getShared: (token: string) => req<{ nome: string; spec: Spec }>("GET", `/shared/${encodeURIComponent(token)}`),
  session: () => req<Session>("GET", "/auth/me"),
  login: (email: string, password: string) => req<{ user: Account }>("POST", "/auth/login", { email, password }),
  register: (email: string, password: string) => req<{ user: Account }>("POST", "/auth/register", { email, password }),
  logout: () => req<void>("POST", "/auth/logout"),
};
