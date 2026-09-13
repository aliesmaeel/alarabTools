import { audit, setRouting, type Capability } from "@alarab/ai";
import { isAdminRequest } from "@/lib/admin-auth";
import { clientIp, fail, json } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  if (!isAdminRequest(req)) return fail("not-found", 404);
  const body = (await req.json().catch(() => ({}))) as { routing?: Partial<Record<Capability, string[]>>; margin?: number };
  const c = await setRouting(body.routing ?? {}, typeof body.margin === "number" ? body.margin : undefined);
  await audit({ ip: clientIp(req), action: "routing.save", detail: `margin ${Math.round(c.margin * 100)}%` });
  return json({ ok: true, routing: c.routing, margin: c.margin });
}
