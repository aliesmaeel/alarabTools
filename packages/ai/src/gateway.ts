/**
 * The gateway: pick providers for a capability in the configured order, skipping any that are
 * disabled, unconfigured, cooling down, over the safety margin, or ruled out by the geo/privacy rules;
 * try them in turn; record usage; put failing ones on cooldown.
 */
import { CAPABILITIES, providerById, type Capability } from "./catalog";
import { credentials, getConfig, isConfigured, type AiConfig } from "./config";
import { clearCooldown, cooldown, getUsage, limitShare, recordUsage, setCooldown, setTestStatus } from "./usage";
import { azureDocint, azureTranslator, google, mock, ocrspace } from "./adapters/ocr";
import { cloudflare, gemini, groq, mistral } from "./adapters/llm";
import { ProviderError, type Adapter, type OcrInput, type OcrPage, type SummarizeInput, type TranslateInput } from "./adapters/types";

export const ADAPTERS: Record<string, Adapter> = { groq, cloudflare, "azure-docint": azureDocint, "azure-translator": azureTranslator, google, ocrspace, gemini, mistral, mock };

export type RouteContext = {
  /** From the visitor's country at job creation; unknown counts as Europe. */
  region: "eu" | "other";
  /** Developer API jobs never use free tiers. */
  source: "web" | "api";
};

export type Candidate = { id: string; skipped?: string };

/** Ordered providers for a capability with the reason each unavailable one was skipped (for the dashboard and logs). */
export async function candidates(cap: Capability, ctx: RouteContext, cfg?: AiConfig): Promise<Candidate[]> {
  const c = cfg ?? (await getConfig());
  const out: Candidate[] = [];
  for (const id of c.routing[cap] ?? []) {
    const def = providerById(id);
    if (!def || !ADAPTERS[id]?.[cap]) continue;
    if (id === "mock" && process.env.AI_MOCK !== "1") continue;
    const pc = c.providers[id];
    if (!pc?.enabled) { out.push({ id, skipped: "disabled" }); continue; }
    if (!isConfigured(c, id)) { out.push({ id, skipped: "not configured" }); continue; }
    if (ctx.source === "api") { out.push({ id, skipped: "free tiers are not used for API jobs" }); continue; }
    if (def.geoRestricted && (ctx.region === "eu" || cap === "ocr")) { out.push({ id, skipped: ctx.region === "eu" ? "visitor in Europe" : "not allowed for OCR" }); continue; }
    const cool = await cooldown(id);
    if (cool) { out.push({ id, skipped: `cooling down (${cool.reason}, ${cool.ttl}s)` }); continue; }
    const share = limitShare(id, await getUsage(id));
    if (share >= c.margin) { out.push({ id, skipped: `at ${Math.round(share * 100)}% of the free limit` }); continue; }
    out.push({ id });
  }
  return out;
}

export class NoProviderError extends Error {
  constructor(public cap: Capability, public tried: Candidate[]) {
    super(`no provider available for ${cap}`);
  }
}

async function attempt<T>(cap: Capability, ctx: RouteContext, units: number, fn: (adapter: Adapter, creds: Record<string, string>) => Promise<T>): Promise<{ result: T; provider: string }> {
  const cfg = await getConfig();
  const list = await candidates(cap, ctx, cfg);
  const errors: string[] = [];
  for (const cand of list) {
    if (cand.skipped) continue;
    const adapter = ADAPTERS[cand.id];
    try {
      const result = await fn(adapter, credentials(cfg, cand.id));
      await recordUsage(cand.id, units);
      return { result, provider: cand.id };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError("error", e instanceof Error ? e.message : String(e));
      errors.push(err.message);
      if (err.kind === "quota") await setCooldown(cand.id, err.retryAfterSeconds ?? 15 * 60, "rate limited");
      else if (err.kind === "unavailable") await setCooldown(cand.id, 5 * 60, "provider error");
      else if (err.kind === "rejected") { await setCooldown(cand.id, 60 * 60, "key rejected"); await setTestStatus(cand.id, { ok: false, at: Date.now(), message: err.message }); }
      else if (err.kind === "bad-input") throw err; // the same input will fail everywhere
      // "error": try the next one
    }
  }
  const tried = list.map((c) => (c.skipped ? c : { ...c, skipped: errors.shift() ?? "failed" }));
  throw new NoProviderError(cap, tried);
}

export const ocr = (input: OcrInput, ctx: RouteContext) => attempt<OcrPage>("ocr", ctx, 1, (a, c) => a.ocr!(c, input));
export const translate = (input: TranslateInput, ctx: RouteContext) => attempt<string>("translate", ctx, Math.max(1, Math.ceil(input.text.length / 1000)), (a, c) => a.translate!(c, input));
export const summarize = (input: SummarizeInput, ctx: RouteContext) => attempt<string>("summarize", ctx, 1, (a, c) => a.summarize!(c, input));

/** Run the adapter's cheapest request and record the outcome for the dashboard. */
export async function testProvider(id: string): Promise<{ ok: boolean; message: string }> {
  const adapter = ADAPTERS[id];
  if (!adapter) return { ok: false, message: "unknown provider" };
  const cfg = await getConfig();
  if (!isConfigured(cfg, id)) return { ok: false, message: "not configured" };
  try {
    const message = await adapter.test(credentials(cfg, id));
    await setTestStatus(id, { ok: true, at: Date.now(), message });
    await clearCooldown(id);
    return { ok: true, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setTestStatus(id, { ok: false, at: Date.now(), message });
    return { ok: false, message };
  }
}

export { CAPABILITIES };
