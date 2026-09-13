"use client";

import { useState, type FormEvent } from "react";

export function LoginForm({ signedOut = false }: { signedOut?: boolean }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      if (res.ok) { location.href = "/admin/providers"; return; }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error === "rate-limited" ? "Too many attempts. Wait 15 minutes and try again." : body.error === "not-configured" ? "The admin area is not configured on this server. Set ADMIN_PASSWORD, ADMIN_SECRET and REDIS_URL." : "Wrong password.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-ink-2">Owner access to providers, routing and jobs.</p>
      </div>
      {signedOut && !error && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal-deep">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
          You have been signed out.
        </p>
      )}
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="admin-password" className="font-medium">Password</label>
        <div className="relative">
          <input
            id="admin-password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            className={`h-12 w-full rounded-lg border bg-surface pe-12 ps-3 text-base outline-none transition-colors focus:border-lapis focus:ring-2 focus:ring-lapis/20 ${error ? "border-red" : "border-line-2"}`}
          />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute end-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink">
            {show ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4 10 7a11 11 0 0 1-2.6 3.8M6.2 6.2A11 11 0 0 0 2 12c1 3 5 7 10 7a9.5 9.5 0 0 0 3.7-.7" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12c1-3 5-7 10-7s9 4 10 7c-1 3-5 7-10 7S3 15 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-red">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="mt-0.5 shrink-0 fill-none stroke-current stroke-2" strokeLinecap="round"><path d="M12 8v5M12 16.5v.5M12 3l10 18H2z" /></svg>
          <span>{error}</span>
        </p>
      )}
      <button type="submit" disabled={busy || !password} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-lapis text-base font-semibold text-white transition-colors hover:bg-lapis-deep disabled:cursor-not-allowed disabled:opacity-40">
        {busy && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-xs text-ink-3">Five attempts per 15 minutes. The session lasts 12 hours and is tied to this browser.</p>
    </form>
  );
}
