import { notFound } from "next/navigation";
import { PROVIDERS, cooldown, getConfig, getUsage, isConfigured, limitShare, publicConfig, requestsToday, testStatus } from "@alarab/ai";
import { isAdmin } from "@/lib/admin-auth";
import { ProviderCards, type ProviderView } from "@/components/admin/ProviderCards";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  if (!(await isAdmin())) notFound();
  const cfg = await getConfig();
  const pub = publicConfig(cfg);
  const views: ProviderView[] = [];
  for (const def of PROVIDERS) {
    if (def.id === "mock" && process.env.AI_MOCK !== "1") continue;
    const pc = pub.providers[def.id];
    const configured = isConfigured(cfg, def.id);
    const usage = await getUsage(def.id);
    const share = limitShare(def.id, usage);
    const cool = await cooldown(def.id);
    const test = await testStatus(def.id);
    let status: ProviderView["status"] = "not-set-up";
    if (configured && pc?.enabled) status = test && !test.ok ? "rejected" : cool ? "cooling" : share >= cfg.margin ? "quota" : "working";
    else if (configured) status = "off";
    views.push({ def, enabled: !!pc?.enabled, configured, fields: pc?.fields ?? {}, usage, share, status, cooldown: cool, test });
  }
  const requests = await requestsToday();
  return <ProviderCards providers={views} margin={cfg.margin} requestsToday={requests} />;
}
