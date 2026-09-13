/** Usage counters, cooldowns and last-test status per provider, all in Redis. */
import { redis } from "@alarab/jobs";
import { providerById } from "./catalog";

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const month = (d = new Date()) => d.toISOString().slice(0, 7);
const minute = (d = new Date()) => d.toISOString().slice(0, 16);

export async function recordUsage(provider: string, units = 1, paidUsd = 0): Promise<void> {
  const r = redis();
  const m = r.multi();
  m.incrby(`alarab:ai:u:${provider}:d:${day()}`, units).expire(`alarab:ai:u:${provider}:d:${day()}`, 3 * 86400);
  m.incrby(`alarab:ai:u:${provider}:m:${month()}`, units).expire(`alarab:ai:u:${provider}:m:${month()}`, 40 * 86400);
  m.incrby(`alarab:ai:u:${provider}:min:${minute()}`, units).expire(`alarab:ai:u:${provider}:min:${minute()}`, 120);
  m.incrby(`alarab:ai:requests:${day()}`, 1).expire(`alarab:ai:requests:${day()}`, 3 * 86400);
  if (paidUsd) m.incrbyfloat(`alarab:ai:paid:${month()}`, paidUsd);
  await m.exec();
}

export type Usage = { day: number; month: number; minute: number };
export async function getUsage(provider: string): Promise<Usage> {
  const r = redis();
  const [d, m, mi] = await r.mget(`alarab:ai:u:${provider}:d:${day()}`, `alarab:ai:u:${provider}:m:${month()}`, `alarab:ai:u:${provider}:min:${minute()}`);
  return { day: Number(d ?? 0), month: Number(m ?? 0), minute: Number(mi ?? 0) };
}

export async function requestsToday(): Promise<number> {
  return Number((await redis().get(`alarab:ai:requests:${day()}`)) ?? 0);
}

/** Share of the free limit used (0..1+), against whichever window the provider's limit is defined on. */
export function limitShare(provider: string, u: Usage): number {
  const def = providerById(provider);
  if (!def) return 0;
  const shares: number[] = [];
  if (def.limit.perDay) shares.push(u.day / def.limit.perDay);
  if (def.limit.perMonth) shares.push(u.month / def.limit.perMonth);
  if (def.limit.perMinute) shares.push(u.minute / def.limit.perMinute);
  return shares.length ? Math.max(...shares) : 0;
}

export async function setCooldown(provider: string, seconds: number, reason: string): Promise<void> {
  await redis().set(`alarab:ai:cool:${provider}`, reason, "EX", seconds);
}
export async function clearCooldown(provider: string): Promise<void> {
  await redis().del(`alarab:ai:cool:${provider}`);
}
export async function cooldown(provider: string): Promise<{ reason: string; ttl: number } | null> {
  const r = redis();
  const reason = await r.get(`alarab:ai:cool:${provider}`);
  if (!reason) return null;
  return { reason, ttl: await r.ttl(`alarab:ai:cool:${provider}`) };
}

export type TestStatus = { ok: boolean; at: number; message: string };
export async function setTestStatus(provider: string, s: TestStatus): Promise<void> {
  await redis().set(`alarab:ai:test:${provider}`, JSON.stringify(s));
}
export async function testStatus(provider: string): Promise<TestStatus | null> {
  const raw = await redis().get(`alarab:ai:test:${provider}`);
  return raw ? (JSON.parse(raw) as TestStatus) : null;
}

/** Append-only audit trail of dashboard changes (kept to the last 500). */
export async function audit(entry: { at?: number; ip: string; action: string; detail?: string }): Promise<void> {
  const r = redis();
  await r.lpush("alarab:ai:audit", JSON.stringify({ at: Date.now(), ...entry }));
  await r.ltrim("alarab:ai:audit", 0, 499);
}
export async function auditLog(limit = 50): Promise<{ at: number; ip: string; action: string; detail?: string }[]> {
  return (await redis().lrange("alarab:ai:audit", 0, limit - 1)).map((s) => JSON.parse(s));
}
