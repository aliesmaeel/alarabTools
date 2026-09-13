import { audit, providerById, testProvider } from "@alarab/ai";
import { isAdminRequest } from "@/lib/admin-auth";
import { clientIp, fail, json } from "../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Runs the provider's cheapest request from here (the same secret decrypts keys on the worker). */
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return fail("not-found", 404);
  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const def = body.provider ? providerById(body.provider) : undefined;
  if (!def) return fail("unknown-provider", 404);
  const result = await testProvider(def.id);
  await audit({ ip: clientIp(req), action: "provider.test", detail: `${def.id}: ${result.ok ? "ok" : "failed"}` });
  return json(result);
}
