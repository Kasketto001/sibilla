import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export class AuthError extends Error {}
export type User = { id: number; email: string };

export const SESSION_DAYS = 30;
const now = () => new Date().toISOString();

const hash = (password: string, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
function matches(password: string, stored: string): boolean {
  const [salt, digest] = stored.split(":");
  const a = Buffer.from(digest ?? "", "hex"), b = scryptSync(password, salt ?? "", 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const userCount = (db: DatabaseSync) => (db.prepare("select count(*) n from sib_users").get() as { n: number }).n;

/** Creates an account. The first one takes over the conversations made before accounts existed. */
export function register(db: DatabaseSync, email: string, password: string): User {
  const mail = email.trim().toLowerCase();
  if (db.prepare("select 1 from sib_users where email = ?").get(mail)) throw new AuthError("Esiste già un account con questa email");
  const first = userCount(db) === 0;
  const id = Number(db.prepare("insert into sib_users (email, password_hash, created_at) values (?, ?, ?)").run(mail, hash(password), now()).lastInsertRowid);
  if (first) db.prepare("update sib_interfaces set user_id = ? where user_id is null").run(id);
  return { id, email: mail };
}

export function login(db: DatabaseSync, email: string, password: string): User {
  const u = db.prepare("select id, email, password_hash from sib_users where email = ?").get(email.trim().toLowerCase()) as
    { id: number; email: string; password_hash: string } | undefined;
  // Same message either way: don't reveal which emails have an account.
  if (!u || !matches(password, u.password_hash)) throw new AuthError("Email o password non corretti");
  return { id: u.id, email: u.email };
}

/** Starts a session and returns its token (what the cookie carries). */
export function openSession(db: DatabaseSync, userId: number): string {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare("insert into sib_sessions (token, user_id, created_at, expires_at) values (?, ?, ?, ?)").run(token, userId, now(), expires);
  db.prepare("delete from sib_sessions where expires_at < ?").run(now());
  return token;
}

export function sessionUser(db: DatabaseSync, token: string | undefined): User | null {
  if (!token) return null;
  return (db.prepare(`select u.id, u.email from sib_sessions s join sib_users u on u.id = s.user_id
    where s.token = ? and s.expires_at > ?`).get(token, now()) as User | undefined) ?? null;
}

export const closeSession = (db: DatabaseSync, token: string) => { db.prepare("delete from sib_sessions where token = ?").run(token); };
