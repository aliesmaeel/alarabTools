import { audit, providerById, removeProvider, setProviderEnabled, setProviderFields } from "@alarab/ai";
import { isAdminRequest } from "@/lib/admin-auth";
import { clientIp, fail, json } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { provider?: string; action?: "set-fields" | "enable" | "disable" | "remove"; fields?: Record<string, string> };

/** Writes only: keys go in, never come back out. */
export async function PUT(req: Request) {
  if (!isAdminRequest(req)) return fail("not-found", 404);
  const body = (await req.json().catch(() => ({}))) as Body;
  const def = body.provider ? providerById(body.provider) : undefined;
  if (!def) return fail("unknown-provider", 404);
  const ip = clientIp(req);
  if (body.action === "set-fields") {
    const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
    await setProviderFields(def.id, fields);
    await audit({ ip, action: "provider.fields", detail: `${def.id}: ${Object.keys(fields).filter((k) => fields[k]).join(", ")}` });
  } else if (body.action === "enable" || body.action === "disable") {
    await setProviderEnabled(def.id, body.action === "enable");
    await audit({ ip, action: `provider.${body.action}`, detail: def.id });
  } else if (body.action === "remove") {
    await removeProvider(def.id);
    await audit({ ip, action: "provider.remove", detail: def.id });
  } else return fail("bad-action");
  return json({ ok: true });
}
