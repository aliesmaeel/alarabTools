import Redis from "ioredis";
import { JOB_TTL, type JobRecord, type JobState } from "./types";

const QUEUE = "alarab:jobs:queue";
const PROCESSING = "alarab:jobs:processing";
const jobKey = (id: string) => `alarab:job:${id}`;

let client: Redis | null = null;
/** One lazily created client per process. REDIS_URL: redis://localhost:6379 locally, rediss://... on Upstash. */
export function redis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set");
    client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true, enableOfflineQueue: true });
  }
  return client;
}

/** A second connection for blocking pops, so they never stall other commands in the worker. */
export function blockingRedis(): Redis {
  return redis().duplicate();
}

export async function createJob(job: JobRecord): Promise<void> {
  await redis().set(jobKey(job.id), JSON.stringify(job), "EX", JOB_TTL);
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const raw = await redis().get(jobKey(id));
  return raw ? (JSON.parse(raw) as JobRecord) : null;
}

/** Merge fields into the record without extending its life. */
export async function updateJob(id: string, patch: Partial<JobRecord>): Promise<JobRecord | null> {
  const r = redis();
  const key = jobKey(id);
  const raw = await r.get(key);
  if (!raw) return null;
  const next = { ...(JSON.parse(raw) as JobRecord), ...patch };
  const ttl = await r.ttl(key);
  await r.set(key, JSON.stringify(next), "EX", ttl > 0 ? ttl : JOB_TTL);
  return next;
}

export async function setState(id: string, state: JobState, extra: Partial<JobRecord> = {}): Promise<void> {
  await updateJob(id, { state, ...extra });
}

export async function deleteJob(id: string): Promise<void> {
  await redis().del(jobKey(id));
}

export async function enqueue(id: string): Promise<void> {
  await redis().lpush(QUEUE, id);
}

/** Worker side: move the next id to the processing list (crash-safe). Resolves null on timeout. */
export async function takeJob(conn: Redis, timeoutSeconds: number): Promise<string | null> {
  const id = await conn.blmove(QUEUE, PROCESSING, "RIGHT", "LEFT", timeoutSeconds);
  return id ?? null;
}

export async function releaseJob(id: string): Promise<void> {
  await redis().lrem(PROCESSING, 0, id);
}

/** On worker start: anything left in the processing list belongs to a crashed run; queue it again. */
export async function requeueStale(): Promise<number> {
  const r = redis();
  const ids = await r.lrange(PROCESSING, 0, -1);
  for (const id of ids) {
    await r.lrem(PROCESSING, 0, id);
    if (await r.exists(jobKey(id))) await r.lpush(QUEUE, id);
  }
  return ids.length;
}

export async function queueLength(): Promise<number> {
  return redis().llen(QUEUE);
}

/** Fixed-window limit per key (e.g. an IP): returns false when over `limit` in `windowSeconds`. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const r = redis();
  const k = `alarab:rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, windowSeconds);
  return n <= limit;
}
