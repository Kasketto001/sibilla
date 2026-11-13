import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { PROVIDERS, type ProviderId, type ProviderStatus } from "@sibilla/shared";

/**
 * The secret that encrypts saved API keys: SIBILLA_SECRET if set, otherwise a random one kept in a file next to the server
 * (created on first run, readable only by its owner). Losing it means re-entering the keys, nothing else.
 */
export function loadSecret(file = ".sibilla-secret", env: Record<string, string | undefined> = process.env): Buffer {
  if (env.SIBILLA_SECRET) return Buffer.from(env.SIBILLA_SECRET.padEnd(32, "0")).subarray(0, 32);
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  return Buffer.from(readFileSync(file, "utf8").trim(), "hex");
}

const PREFIX = "v1:";

/** API keys of the model providers, encrypted at rest. A key saved from the app's settings wins over the server environment. */
export class KeyStore {
  constructor(
    private db: DatabaseSync,
    private env: Record<string, string | undefined> = process.env,
    private secret: Buffer = randomBytes(32), // without a persistent secret, saved keys last as long as the process (tests)
  ) {}

  private seal(key: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.secret, iv);
    const body = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
    return PREFIX + [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(":");
  }
  private open(value: string): string | null {
    const [iv, tag, body] = value.slice(PREFIX.length).split(":").map((p) => Buffer.from(p, "base64"));
    try {
      const d = createDecipheriv("aes-256-gcm", this.secret, iv).setAuthTag(tag);
      return Buffer.concat([d.update(body), d.final()]).toString("utf8");
    } catch { return null; } // encrypted with another secret: as good as not saved
  }

  private saved(id: ProviderId): string | null {
    const r = this.db.prepare("select value from sib_settings where key = ?").get(`key.${id}`) as { value: string } | undefined;
    if (!r?.value) return null;
    if (r.value.startsWith(PREFIX)) return this.open(r.value);
    this.set(id, r.value); // saved before keys were encrypted: encrypt it now
    return r.value;
  }
  private fromEnv(id: ProviderId): string | null {
    return this.env[PROVIDERS.find((p) => p.id === id)!.env] || null;
  }

  get(id: ProviderId): string | null { return this.saved(id) ?? this.fromEnv(id); }

  set(id: ProviderId, key: string) {
    this.db.prepare("insert into sib_settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value").run(`key.${id}`, this.seal(key));
  }
  remove(id: ProviderId) { this.db.prepare("delete from sib_settings where key = ?").run(`key.${id}`); }

  /** Never the keys themselves: only whether each provider is usable, and the last characters to recognise the key. */
  status(): ProviderStatus[] {
    return PROVIDERS.map(({ id }) => {
      const saved = this.saved(id), key = saved ?? this.fromEnv(id);
      return { id, configured: !!key, source: saved ? "saved" : key ? "env" : null, hint: key ? `…${key.slice(-4)}` : null };
    });
  }
}
