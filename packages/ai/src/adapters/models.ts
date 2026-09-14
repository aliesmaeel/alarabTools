/**
 * Providers retire models without notice (Groq removed every Llama chat model by September 2026), so
 * adapters never hard-code one model. Each asks the provider which models the key can use, picks the
 * first match from a preference list, and falls back to any model that passes a filter. The choice is
 * cached per key for an hour and dropped when a request reports the model is gone.
 */
import { createHash } from "node:crypto";
import { failFrom, ProviderError } from "./types";

type Entry = { models: string[]; at: number };
const cache = new Map<string, Entry>();
const TTL = 60 * 60 * 1000;

const keyOf = (provider: string, secret: string) => `${provider}:${createHash("sha256").update(secret).digest("hex").slice(0, 16)}`;

export type ModelSource = {
  provider: string;
  /** Credential that scopes the list (cache key only; never logged). */
  secret: string;
  /** Returns the model ids this key can use. */
  list: () => Promise<string[]>;
  /** Most preferred first. Exact ids or prefixes ending in "*". */
  prefer: string[];
  /** Fallback filter when nothing in `prefer` is available. */
  accept: (id: string) => boolean;
  /** Optional override, e.g. from an environment variable. */
  override?: string;
};

export async function availableModels(src: ModelSource, fresh = false): Promise<string[]> {
  const k = keyOf(src.provider, src.secret);
  const hit = cache.get(k);
  if (hit && !fresh && Date.now() - hit.at < TTL) return hit.models;
  const models = await src.list();
  cache.set(k, { models, at: Date.now() });
  return models;
}

export function choose(models: string[], prefer: string[], accept: (id: string) => boolean): string | null {
  for (const p of prefer) {
    const hit = p.endsWith("*") ? models.filter((m) => m.startsWith(p.slice(0, -1))).sort().reverse()[0] : models.find((m) => m === p);
    if (hit) return hit;
  }
  return models.filter(accept).sort()[0] ?? null;
}

export async function pickModel(src: ModelSource, fresh = false): Promise<string> {
  if (src.override) return src.override;
  const model = choose(await availableModels(src, fresh), src.prefer, src.accept);
  if (!model) throw new ProviderError("rejected", `${src.provider}: no suitable text model is available to this key`);
  return model;
}

export function forgetModels(provider: string, secret: string) {
  cache.delete(keyOf(provider, secret));
}

/** True when an error says the model itself is missing or retired (worth refreshing the list and retrying once). */
export function isModelGone(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /model_not_found|model.{0,40}(does not exist|not found|decommissioned|deprecated|no longer supported)|not found for API version|is not supported for generateContent/i.test(msg);
}

/** Run with the chosen model; if the provider says it is gone, refresh the list once and retry with the next pick. */
export async function withModel<T>(src: ModelSource, fn: (model: string) => Promise<T>): Promise<T> {
  const model = await pickModel(src);
  try {
    return await fn(model);
  } catch (e) {
    if (src.override || !isModelGone(e)) throw e;
    forgetModels(src.provider, src.secret);
    const next = await pickModel(src, true);
    if (next === model) throw e;
    return fn(next);
  }
}

/** GET a JSON model list, mapping auth failures to the usual provider errors. */
export async function fetchModelIds(url: string, headers: Record<string, string>, provider: string, extract: (json: unknown) => string[]): Promise<string[]> {
  const res = await fetch(url, { headers });
  if (!res.ok) await failFrom(res, provider);
  return extract(await res.json());
}
