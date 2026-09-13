import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function fail(code: string, status = 400) {
  return json({ error: code }, status);
}

/** True when the queue and storage are configured; the tool pages show "coming soon" otherwise. */
export function serverToolsEnabled(): boolean {
  return !!process.env.REDIS_URL;
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
