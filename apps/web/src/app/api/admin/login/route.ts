import { rateLimit } from "@alarab/jobs";
import { audit } from "@alarab/ai";
import { ADMIN_COOKIE, adminEnabled, checkPassword, issueToken, sessionSeconds } from "@/lib/admin-auth";
import { clientIp, fail, json } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!adminEnabled()) return fail("not-configured", 503);
  const ip = clientIp(req);
  if (!(await rateLimit(`admin-login:${ip}`, 5, 15 * 60))) return fail("rate-limited", 429);
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!checkPassword(String(body.password ?? ""))) {
    await audit({ ip, action: "login-failed" });
    return fail("bad-password", 401);
  }
  await audit({ ip, action: "login" });
  const res = json({ ok: true });
  res.headers.append("set-cookie", `${ADMIN_COOKIE}=${issueToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionSeconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return res;
}
