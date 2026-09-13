"use client";

import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (res.ok) { location.href = "/admin/providers"; return; }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error === "rate-limited" ? "Too many attempts. Try again in 15 minutes." : body.error === "not-configured" ? "The admin area is not configured on this server (ADMIN_PASSWORD, ADMIN_SECRET, REDIS_URL)." : "Wrong password.");
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col gap-4 rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-lg border border-line-2 bg-surface px-3 text-base focus:border-lapis" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-red">{error}</p>}
      <button type="submit" disabled={busy || !password} className="h-11 rounded-lg bg-lapis text-base font-semibold text-white hover:bg-lapis-deep disabled:opacity-40">Sign in</button>
    </form>
  );
}
