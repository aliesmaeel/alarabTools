import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "alarab_admin";
const SESSION_SECONDS = 12 * 60 * 60;

function secret(): string {
  return process.env.ADMIN_SECRET || process.env.JOBS_SECRET || "";
}

export function adminEnabled(): boolean {
  return !!process.env.ADMIN_PASSWORD && !!secret() && !!process.env.REDIS_URL;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const a = Buffer.from(candidate), b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** A signed, expiring token; nothing is stored server-side. */
export function issueToken(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `admin.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !adminEnabled()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [who, exp, sig] = parts;
  if (who !== "admin" || Number(exp) * 1000 < Date.now()) return false;
  const expected = sign(`${who}.${exp}`);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifyToken(jar.get(ADMIN_COOKIE)?.value);
}

export function isAdminRequest(req: Request): boolean {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  return verifyToken(m?.[1]);
}

export const sessionSeconds = SESSION_SECONDS;
