/**
 * Provider configuration lives in one Redis key. Secret fields are AES-256-GCM encrypted with
 * KEYS_SECRET; the dashboard only ever sees the last four characters.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { redis } from "@alarab/jobs";
import { CAPABILITIES, DEFAULT_ROUTING, PROVIDERS, type Capability } from "./catalog";

const KEY = "alarab:ai:config";

export type StoredField = { enc?: string; plain?: string; last4: string };
export type ProviderConfig = { enabled: boolean; fields: Record<string, StoredField>; updatedAt?: number };
export type AiConfig = {
  providers: Record<string, ProviderConfig>;
  routing: Record<Capability, string[]>;
  /** Skip a provider once it has used this share of its free limit (0..1). */
  margin: number;
  updatedAt: number;
};

function secret(): Buffer {
  const s = process.env.KEYS_SECRET;
  if (!s) throw new Error("KEYS_SECRET is not set");
  return createHash("sha256").update(s).digest();
}
export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}
export function decrypt(enc: string): string {
  const buf = Buffer.from(enc, "base64");
  const d = createDecipheriv("aes-256-gcm", secret(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

export function emptyConfig(): AiConfig {
  return { providers: {}, routing: { ...DEFAULT_ROUTING }, margin: 0.9, updatedAt: 0 };
}

export async function getConfig(): Promise<AiConfig> {
  const raw = await redis().get(KEY);
  if (!raw) return emptyConfig();
  const c = JSON.parse(raw) as Partial<AiConfig>;
  const routing = { ...DEFAULT_ROUTING, ...(c.routing ?? {}) };
  for (const cap of CAPABILITIES) routing[cap] = routing[cap].filter((id) => PROVIDERS.some((p) => p.id === id && p.capabilities.includes(cap)));
  return { providers: c.providers ?? {}, routing, margin: typeof c.margin === "number" ? c.margin : 0.9, updatedAt: c.updatedAt ?? 0 };
}

async function save(c: AiConfig): Promise<void> {
  c.updatedAt = Date.now();
  await redis().set(KEY, JSON.stringify(c));
}

/** Write (or overwrite) fields for a provider. Empty strings leave the stored value untouched. */
export async function setProviderFields(id: string, values: Record<string, string>): Promise<AiConfig> {
  const def = PROVIDERS.find((p) => p.id === id);
  if (!def) throw new Error("unknown provider");
  const c = await getConfig();
  const cur = c.providers[id] ?? { enabled: false, fields: {} };
  for (const f of def.fields) {
    const v = (values[f.name] ?? "").trim();
    if (!v) continue;
    cur.fields[f.name] = f.secret ? { enc: encrypt(v), last4: v.slice(-4) } : { plain: v, last4: v.slice(-4) };
  }
  cur.updatedAt = Date.now();
  c.providers[id] = cur;
  await save(c);
  return c;
}

export async function setProviderEnabled(id: string, enabled: boolean): Promise<AiConfig> {
  const c = await getConfig();
  c.providers[id] = { ...(c.providers[id] ?? { fields: {} }), enabled };
  await save(c);
  return c;
}

export async function removeProvider(id: string): Promise<AiConfig> {
  const c = await getConfig();
  delete c.providers[id];
  await save(c);
  return c;
}

export async function setRouting(routing: Partial<Record<Capability, string[]>>, margin?: number): Promise<AiConfig> {
  const c = await getConfig();
  for (const cap of CAPABILITIES) {
    const order = routing[cap];
    if (!order) continue;
    const valid = order.filter((id) => PROVIDERS.some((p) => p.id === id && p.capabilities.includes(cap)));
    // Gemini's free tier only takes overflow: it is pinned last whatever the order says.
    c.routing[cap] = [...valid.filter((id) => id !== "gemini"), ...(valid.includes("gemini") ? ["gemini"] : [])];
  }
  if (typeof margin === "number" && margin >= 0.1 && margin <= 1) c.margin = margin;
  await save(c);
  return c;
}

/** True when every field the provider needs has a value. */
export function isConfigured(c: AiConfig, id: string): boolean {
  const def = PROVIDERS.find((p) => p.id === id);
  const pc = c.providers[id];
  return !!def && !!pc && def.fields.every((f) => !!pc.fields[f.name]);
}

/** Decrypted field values for the adapters (worker or trusted server code only). */
export function credentials(c: AiConfig, id: string): Record<string, string> {
  const pc = c.providers[id];
  const out: Record<string, string> = {};
  if (!pc) return out;
  for (const [name, f] of Object.entries(pc.fields)) out[name] = f.enc ? decrypt(f.enc) : (f.plain ?? "");
  return out;
}

/** What the dashboard may see: last four characters, never the value. */
export function publicConfig(c: AiConfig) {
  return {
    margin: c.margin,
    routing: c.routing,
    updatedAt: c.updatedAt,
    providers: Object.fromEntries(Object.entries(c.providers).map(([id, pc]) => [id, { enabled: pc.enabled, updatedAt: pc.updatedAt, fields: Object.fromEntries(Object.entries(pc.fields).map(([n, f]) => [n, { last4: f.last4, plain: f.plain }])) }])),
  };
}
