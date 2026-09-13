import { notFound } from "next/navigation";
import { CAPABILITIES, PROVIDERS, candidates, getConfig } from "@alarab/ai";
import { isAdmin } from "@/lib/admin-auth";
import { RoutingEditor, type CapabilityView } from "@/components/admin/RoutingEditor";

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  if (!(await isAdmin())) notFound();
  const cfg = await getConfig();
  const caps: CapabilityView[] = [];
  for (const cap of CAPABILITIES) {
    const state = await candidates(cap, { region: "other", source: "web" }, cfg);
    const order = cfg.routing[cap];
    const available = PROVIDERS.filter((p) => p.capabilities.includes(cap) && (p.id !== "mock" || process.env.AI_MOCK === "1")).map((p) => p.id);
    caps.push({ cap, order: [...order, ...available.filter((id) => !order.includes(id))], names: Object.fromEntries(PROVIDERS.map((p) => [p.id, p.name])), skipped: Object.fromEntries(state.map((c) => [c.id, c.skipped ?? ""])) });
  }
  return <RoutingEditor caps={caps} margin={cfg.margin} />;
}
