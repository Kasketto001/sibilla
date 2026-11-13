import { DatabaseSync } from "node:sqlite";
import { seed } from "./seed";

const DDL = `
create table if not exists clienti (
  id integer primary key, nome text not null, email text not null, citta text, segmento text not null);
create table if not exists prodotti (
  id integer primary key, nome text not null, categoria text not null, prezzo real not null, attivo integer not null default 1);
create table if not exists ordini (
  id integer primary key, cliente_id integer not null references clienti(id), data text not null,
  stato text not null, totale real not null,
  mese text generated always as (substr(data, 1, 7)) virtual);
create table if not exists righe_ordine (
  id integer primary key, ordine_id integer not null references ordini(id),
  prodotto_id integer not null references prodotti(id), quantita integer not null, prezzo_unitario real not null);
create table if not exists sib_interfaces (
  id integer primary key, nome text not null, descrizione text, created_at text not null, updated_at text not null);
create table if not exists sib_versions (
  id integer primary key, interface_id integer not null references sib_interfaces(id) on delete cascade,
  numero integer not null, spec_json text not null, prompt text, created_at text not null,
  unique (interface_id, numero));
create table if not exists sib_messages (
  id integer primary key, interface_id integer not null references sib_interfaces(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')), content text not null,
  attachments_json text not null default '[]', created_at text not null);
create table if not exists sib_docs (
  id integer primary key, app_id text not null, collection text not null,
  data text not null, created_at text not null, updated_at text not null);
create index if not exists sib_docs_app on sib_docs (app_id, collection);
create table if not exists sib_settings (key text primary key, value text not null);
create table if not exists sib_users (id integer primary key, email text not null unique, password_hash text not null, created_at text not null);
create table if not exists sib_sessions (
  token text primary key, user_id integer not null references sib_users(id) on delete cascade,
  created_at text not null, expires_at text not null);
`;

/** Columns added after a table first shipped: existing databases get them on open. */
const ADDED: [table: string, column: string, decl: string][] = [
  ["sib_messages", "meta_json", "text"],
  ["sib_interfaces", "pinned", "integer not null default 0"],
  ["sib_interfaces", "archived", "integer not null default 0"],
  ["sib_interfaces", "share_token", "text"],
  ["sib_interfaces", "user_id", "integer"],
];

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("pragma foreign_keys = on");
  db.exec(DDL);
  for (const [table, column, decl] of ADDED) {
    const has = (db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
    if (!has) db.exec(`alter table ${table} add column ${column} ${decl}`);
  }
  const { n } = db.prepare("select count(*) n from clienti").get() as { n: number };
  if (n === 0) seed(db);
  return db;
}
