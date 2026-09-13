"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProviderDef, TestStatus, Usage } from "@alarab/ai";

export type ProviderView = {
  def: ProviderDef;
  enabled: boolean;
  configured: boolean;
  fields: Record<string, { last4: string; plain?: string }>;
  usage: Usage;
  share: number;
  status: "working" | "cooling" | "quota" | "rejected" | "off" | "not-set-up";
  cooldown: { reason: string; ttl: number } | null;
  test: TestStatus | null;
};

const STATUS: Record<ProviderView["status"], { label: string; cls: string }> = {
  working: { label: "Working", cls: "bg-teal-soft text-teal-deep" },
  cooling: { label: "Cooling down", cls: "bg-saffron-soft text-saffron-deep" },
  quota: { label: "At safety margin", cls: "bg-saffron-soft text-saffron-deep" },
  rejected: { label: "Key rejected", cls: "bg-[#fdecea] text-red" },
  off: { label: "Off", cls: "bg-ground text-ink-2" },
  "not-set-up": { label: "Not set up", cls: "bg-ground text-ink-2" },
};
const CAP_LABEL: Record<string, string> = { ocr: "Arabic OCR", translate: "Translate", summarize: "Summarize" };

async function call(path: string, body: unknown): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch(path, { method: path.endsWith("/test") ? "POST" : "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({ ok: false, error: `http-${res.status}` }))) as { ok: boolean; message?: string; error?: string };
}

function Meter({ label, value, limit, margin }: { label: string; value: number; limit: number; margin: number }) {
  const pct = Math.min(100, (value / limit) * 100);
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex justify-between"><span className="text-ink-2">{label}</span><span className="tabular-nums">{value.toLocaleString("en")} / {limit.toLocaleString("en")}</span></div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-ground">
        <div className={`h-full rounded-full ${pct >= margin * 100 ? "bg-saffron" : "bg-teal"}`} style={{ width: `${pct}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${margin * 100}%` }} title="Safety margin" />
      </div>
    </div>
  );
}

export function ProviderCards({ providers, margin, requestsToday }: { providers: ProviderView[]; margin: number; requestsToday: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProviderView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Record<string, string>>({});
  const counts = { working: providers.filter((p) => p.status === "working").length, attention: providers.filter((p) => ["cooling", "quota", "rejected"].includes(p.status)).length, unset: providers.filter((p) => p.status === "not-set-up").length };

  const act = async (id: string, body: unknown, path = "/api/admin/providers") => {
    setBusy(id);
    const r = await call(path, body);
    setBusy(null);
    if (r.message || r.error) setNotice((n) => ({ ...n, [id]: r.message ?? r.error ?? "" }));
    router.refresh();
    return r;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">AI providers</h1>
          <p className="max-w-[640px] text-sm text-ink-2">Keys are encrypted before they are stored and can never be shown again; the dashboard shows the last four characters. Replace a key at any time.</p>
        </div>
        <button type="button" disabled={busy !== null} onClick={async () => { for (const p of providers) if (p.configured) await act(p.def.id, { provider: p.def.id }, "/api/admin/providers/test"); }} className="h-10 rounded-lg border border-line-2 bg-surface px-4 text-sm font-medium hover:border-ink-3 disabled:opacity-40">Test all providers</button>
      </div>

      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface sm:grid-cols-4">
        {[["Working", counts.working, "text-teal-deep"], ["Needs attention", counts.attention, "text-red"], ["Not set up", counts.unset, "text-ink-2"], ["AI requests today", requestsToday.toLocaleString("en"), ""]].map(([l, v, cls], i) => (
          <div key={i} className="flex flex-col gap-0.5 border-line px-5 py-4 [&:not(:last-child)]:border-r"><span className="text-xs text-ink-2">{l}</span><span className={`text-2xl font-semibold tabular-nums ${cls}`}>{v}</span></div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {providers.map((p) => {
          const st = STATUS[p.status];
          const lim = p.def.limit;
          return (
            <section key={p.def.id} data-testid={`provider-${p.def.id}`} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[17px] font-semibold">{p.def.name}</span>
                  <span className="text-xs text-ink-2">{p.def.site}{p.def.optional ? " · optional" : ""}{p.def.trainsOnData ? " · trains on data" : ""}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                  <button type="button" role="switch" aria-checked={p.enabled} aria-label={`${p.def.name} enabled`} disabled={!p.configured || busy === p.def.id} onClick={() => act(p.def.id, { provider: p.def.id, action: p.enabled ? "disable" : "enable" })} className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors disabled:opacity-40 ${p.enabled ? "justify-end bg-teal" : "justify-start bg-line-2"}`}>
                    <span className="size-5 rounded-full bg-white shadow" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.def.capabilities.map((c) => <span key={c} className="rounded-md bg-ground px-2 py-0.5 text-xs text-ink-2">{CAP_LABEL[c] ?? c}</span>)}
              </div>
              <div className="flex flex-col gap-1.5">
                {p.def.fields.map((f) => (
                  <div key={f.name} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-sm">
                    <span className="text-ink-2">{f.label}</span>
                    <span className="truncate font-mono text-[13px]">{p.fields[f.name] ? (f.secret ? `••••••••${p.fields[f.name].last4}` : p.fields[f.name].plain) : <span className="text-ink-3">not set</span>}</span>
                  </div>
                ))}
              </div>
              {p.configured && (
                <div className="flex flex-col gap-2">
                  {lim.perDay && <Meter label="Today" value={p.usage.day} limit={lim.perDay} margin={margin} />}
                  {lim.perMonth && <Meter label="This month" value={p.usage.month} limit={lim.perMonth} margin={margin} />}
                  {lim.perMinute && <Meter label="This minute" value={p.usage.minute} limit={lim.perMinute} margin={margin} />}
                  <span className="text-[11px] text-ink-3">{lim.unit}</span>
                </div>
              )}
              {p.cooldown && <p className="text-xs text-saffron-deep">Cooling down: {p.cooldown.reason} ({Math.ceil(p.cooldown.ttl / 60)} min left)</p>}
              {(notice[p.def.id] || p.test) && (
                <p data-testid="provider-note" className={`text-xs ${notice[p.def.id] ? "text-ink" : p.test?.ok ? "text-teal-deep" : "text-red"}`}>
                  {notice[p.def.id] ?? `Last test ${new Date(p.test!.at).toLocaleTimeString("en-GB")}: ${p.test!.message}`}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={!p.configured || busy === p.def.id} onClick={() => act(p.def.id, { provider: p.def.id }, "/api/admin/providers/test")} className="h-9 rounded-md border border-line-2 px-3 text-sm font-medium hover:border-ink-3 disabled:opacity-40">{busy === p.def.id ? "Testing…" : "Test"}</button>
                <button type="button" onClick={() => setEditing(p)} className="h-9 rounded-md border border-line-2 px-3 text-sm font-medium hover:border-ink-3">{p.configured ? "Replace key" : "Add key"}</button>
                {p.configured && <button type="button" onClick={() => { if (confirm(`Remove ${p.def.name}'s key?`)) act(p.def.id, { provider: p.def.id, action: "remove" }); }} className="h-9 rounded-md px-3 text-sm font-medium text-red hover:bg-red/5">Remove</button>}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-ink-2">The dark tick on each bar is your safety margin: a provider is skipped once it reaches {Math.round(margin * 100)}% of its free limit. Change it under Routing.</p>

      {editing && <KeyDialog view={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function KeyDialog({ view, onClose, onSaved }: { view: ProviderView; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const ready = view.def.fields.every((f) => (values[f.name] ?? "").trim() || view.fields[f.name]);

  async function testAndSave() {
    setBusy(true);
    setResult(null);
    const saved = await call("/api/admin/providers", { provider: view.def.id, action: "set-fields", fields: values });
    if (!saved.ok) { setBusy(false); setResult(saved.error ?? "Could not save"); return; }
    const test = await call("/api/admin/providers/test", { provider: view.def.id });
    if (test.ok && !view.enabled) await call("/api/admin/providers", { provider: view.def.id, action: "enable" });
    setBusy(false);
    setResult(test.ok ? `Saved. ${test.message}` : `Saved, but the test failed: ${test.message}`);
    if (test.ok) setTimeout(onSaved, 900);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="key-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="flex w-full max-w-[520px] flex-col gap-4 rounded-xl border border-line bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h2 id="key-dialog-title" className="text-lg font-semibold">{view.configured ? "Replace" : "Add"} {view.def.name} key</h2>
        {view.configured && view.def.fields.some((f) => f.secret && view.fields[f.name]) && <p className="text-sm text-ink-2">Current key ends in <span className="font-mono">{view.def.fields.filter((f) => f.secret).map((f) => view.fields[f.name]?.last4).filter(Boolean).join(", ")}</span>.</p>}
        {view.def.fields.map((f) => (
          <label key={f.name} className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{f.label}</span>
            <input type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false} placeholder={view.fields[f.name] ? (f.secret ? `leave empty to keep ••••${view.fields[f.name].last4}` : view.fields[f.name].plain) : f.placeholder} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className="h-11 rounded-lg border border-line-2 bg-surface px-3 font-mono text-sm focus:border-lapis" dir="ltr" />
            {f.hint && <span className="text-xs text-ink-2">{f.hint}</span>}
          </label>
        ))}
        <p className="text-xs text-ink-2">The key is encrypted before it is stored. After saving, nobody can view it again, including you; the dashboard shows the last four characters.</p>
        {result && <p data-testid="key-result" className="rounded-lg bg-ground px-3 py-2 text-sm">{result}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-line-2 px-4 text-sm font-medium hover:border-ink-3">Cancel</button>
          <button type="button" disabled={!ready || busy} onClick={testAndSave} className="h-10 rounded-lg bg-lapis px-4 text-sm font-semibold text-white hover:bg-lapis-deep disabled:opacity-40">{busy ? "Testing…" : "Test and save"}</button>
        </div>
      </div>
    </div>
  );
}
