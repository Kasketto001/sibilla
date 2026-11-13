import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  SpecSchema, validateSpecTree, type ChatMessage, type InterfaceDetail, type StoredMessage, type InterfaceSummary, type InterfaceVersion, type Spec,
} from "@sibilla/shared";

export class InvalidSpecError extends Error {}

/** Whose conversations a call works on. null = no accounts in use (single-user setups and tests): everything is visible. */
export type Owner = number | null;

const now = () => new Date().toISOString();

function checkSpec(spec: Spec): string {
  const parsed = SpecSchema.parse(spec);
  const errors = validateSpecTree(parsed);
  if (errors.length) throw new InvalidSpecError(`Spec non valida: ${errors.join("; ")}`);
  return JSON.stringify(parsed);
}

// kind looks at the latest version: a spec that declares collections is a mini webapp, any other spec a view.
const SUMMARY = `select i.id, i.nome, i.descrizione, i.updated_at as updatedAt, i.pinned, i.archived, i.share_token as shareToken,
  (select max(numero) from sib_versions v where v.interface_id = i.id) as latestVersion,
  coalesce((select case when json_array_length(coalesce(json_extract(v.spec_json, '$.collections'), '[]')) > 0 then 'app' else 'view' end
    from sib_versions v where v.interface_id = i.id order by v.numero desc limit 1), 'chat') as kind
  from sib_interfaces i`;
type Row = Omit<InterfaceSummary, "pinned" | "archived"> & { pinned: number; archived: number };
const summary = (r: Row): InterfaceSummary => ({ ...r, pinned: !!r.pinned, archived: !!r.archived });

export function listInterfaces(db: DatabaseSync, owner: Owner = null): InterfaceSummary[] {
  const rows = owner === null
    ? db.prepare(`${SUMMARY} order by i.updated_at desc, i.id desc`).all()
    : db.prepare(`${SUMMARY} where i.user_id = ? order by i.updated_at desc, i.id desc`).all(owner);
  return (rows as Row[]).map(summary);
}

export function getInterface(db: DatabaseSync, id: number, owner: Owner = null): InterfaceDetail | null {
  const r = (owner === null
    ? db.prepare(`${SUMMARY} where i.id = ?`).get(id)
    : db.prepare(`${SUMMARY} where i.id = ? and i.user_id = ?`).get(id, owner)) as Row | undefined;
  if (!r) return null;
  const versions = db.prepare(
    "select numero, prompt, created_at as createdAt from sib_versions where interface_id = ? order by numero",
  ).all(id) as InterfaceDetail["versions"];
  return { ...summary(r), versions };
}

function insertMessages(db: DatabaseSync, id: number, messages: ChatMessage[]) {
  const st = db.prepare("insert into sib_messages (interface_id, role, content, attachments_json, meta_json, created_at) values (?, ?, ?, ?, ?, ?)");
  const t = now();
  for (const m of messages) {
    const meta = m.thinking || m.usage ? JSON.stringify({ thinking: m.thinking, usage: m.usage }) : null;
    st.run(id, m.role, m.content, JSON.stringify(m.attachments ?? []), meta, t);
  }
}

export function createInterface(
  db: DatabaseSync,
  b: { nome: string; descrizione?: string | null; spec: Spec | null; prompt: string | null; messages?: ChatMessage[] },
  owner: Owner = null,
): InterfaceDetail {
  // A conversation is saved as soon as it starts: its first interface (version 1) may come later.
  const json = b.spec && checkSpec(b.spec);
  const t = now();
  db.exec("begin");
  try {
    const { lastInsertRowid } = db.prepare(
      "insert into sib_interfaces (nome, descrizione, created_at, updated_at, user_id) values (?, ?, ?, ?, ?)",
    ).run(b.nome, b.descrizione ?? null, t, t, owner);
    if (json) db.prepare("insert into sib_versions (interface_id, numero, spec_json, prompt, created_at) values (?, 1, ?, ?, ?)")
      .run(lastInsertRowid, json, b.prompt, t);
    insertMessages(db, Number(lastInsertRowid), b.messages ?? []);
    db.exec("commit");
    return getInterface(db, Number(lastInsertRowid))!;
  } catch (e) { db.exec("rollback"); throw e; }
}

export function getVersion(db: DatabaseSync, id: number, numero: number, owner: Owner = null): InterfaceVersion | null {
  if (!getInterface(db, id, owner)) return null;
  const r = db.prepare(
    "select numero, spec_json, prompt, created_at as createdAt from sib_versions where interface_id = ? and numero = ?",
  ).get(id, numero) as { numero: number; spec_json: string; prompt: string | null; createdAt: string } | undefined;
  return r ? { numero: r.numero, spec: JSON.parse(r.spec_json), prompt: r.prompt, createdAt: r.createdAt } : null;
}

export function addVersion(db: DatabaseSync, id: number, b: { spec: Spec; prompt: string | null }, owner: Owner = null): InterfaceDetail | null {
  const json = checkSpec(b.spec);
  if (!getInterface(db, id, owner)) return null;
  const t = now();
  db.prepare(`insert into sib_versions (interface_id, numero, spec_json, prompt, created_at)
    values (?, (select coalesce(max(numero), 0) + 1 from sib_versions where interface_id = ?), ?, ?, ?)`)
    .run(id, id, json, b.prompt, t);
  db.prepare("update sib_interfaces set updated_at = ? where id = ?").run(t, id);
  return getInterface(db, id);
}

/** Renames, pins or archives. Only a rename counts as activity: pinning and archiving leave the conversation where it was in time. */
export function updateInterface(
  db: DatabaseSync, id: number, b: { nome?: string; descrizione?: string | null; pinned?: boolean; archived?: boolean }, owner: Owner = null,
): InterfaceDetail | null {
  const cur = getInterface(db, id, owner);
  if (!cur) return null;
  const renamed = (b.nome !== undefined && b.nome !== cur.nome) || (b.descrizione !== undefined && b.descrizione !== cur.descrizione);
  db.prepare("update sib_interfaces set nome = ?, descrizione = ?, pinned = ?, archived = ?, updated_at = ? where id = ?").run(
    b.nome ?? cur.nome, b.descrizione === undefined ? cur.descrizione : b.descrizione,
    Number(b.pinned ?? cur.pinned), Number(b.archived ?? cur.archived), renamed ? now() : cur.updatedAt, id,
  );
  return getInterface(db, id);
}

/** Deletes the interface and, with it, the documents of the mini webapp it defines. */
export function deleteInterface(db: DatabaseSync, id: number, owner: Owner = null): boolean {
  if (!getInterface(db, id, owner)) return false;
  db.prepare(`delete from sib_docs where app_id in
    (select json_extract(spec_json, '$.appId') from sib_versions where interface_id = ?)`).run(id);
  return db.prepare("delete from sib_interfaces where id = ?").run(id).changes > 0;
}

export function listMessages(db: DatabaseSync, id: number, owner: Owner = null): StoredMessage[] | null {
  if (!getInterface(db, id, owner)) return null;
  const rows = db.prepare(
    "select role, content, attachments_json, meta_json, created_at as createdAt from sib_messages where interface_id = ? order by id",
  ).all(id) as { role: "user" | "assistant"; content: string; attachments_json: string; meta_json: string | null; createdAt: string }[];
  return rows.map((r) => ({
    role: r.role, content: r.content, attachments: JSON.parse(r.attachments_json), createdAt: r.createdAt, ...(r.meta_json ? JSON.parse(r.meta_json) : {}),
  }));
}

export function appendMessages(db: DatabaseSync, id: number, messages: ChatMessage[], owner: Owner = null): boolean {
  if (!getInterface(db, id, owner)) return false;
  insertMessages(db, id, messages);
  db.prepare("update sib_interfaces set updated_at = ? where id = ?").run(now(), id);
  return true;
}

/** Turns the public link of a conversation's app on (a new unguessable token) or off. */
export function setShared(db: DatabaseSync, id: number, shared: boolean, owner: Owner = null): InterfaceDetail | null {
  const cur = getInterface(db, id, owner);
  if (!cur) return null;
  if (shared !== !!cur.shareToken)
    db.prepare("update sib_interfaces set share_token = ? where id = ?").run(shared ? randomBytes(18).toString("base64url") : null, id);
  return getInterface(db, id);
}

/** The app behind a public link: the latest version of its conversation. */
export function getShared(db: DatabaseSync, token: string): { nome: string; spec: Spec } | null {
  const r = db.prepare(`select i.nome, (select spec_json from sib_versions v where v.interface_id = i.id order by numero desc limit 1) as spec_json
    from sib_interfaces i where i.share_token = ?`).get(token) as { nome: string; spec_json: string | null } | undefined;
  return r?.spec_json ? { nome: r.nome, spec: JSON.parse(r.spec_json) } : null;
}

/**
 * Removes documents no saved conversation can reach any more (apps generated but never kept), once they are a day old
 * so an app being built right now is never touched.
 */
export function deleteOrphanDocs(db: DatabaseSync): number {
  const before = new Date(Date.now() - 86_400_000).toISOString();
  return Number(db.prepare(`delete from sib_docs where created_at < ? and app_id not in
    (select json_extract(spec_json, '$.appId') from sib_versions where json_extract(spec_json, '$.appId') is not null)`).run(before).changes);
}
