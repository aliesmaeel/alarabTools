"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CapabilityView = { cap: string; order: string[]; names: Record<string, string>; skipped: Record<string, string> };

const TITLE: Record<string, { title: string; tools: string; fallback: string }> = {
  ocr: { title: "Arabic OCR", tools: "OCR PDF, PDF to Word (scans)", fallback: "Tesseract on the worker" },
  translate: { title: "Translate", tools: "Translate PDF", fallback: "queue and retry" },
  summarize: { title: "Summarize", tools: "Summarize PDF", fallback: "queue and retry" },
};

const RULES = [
  { title: "Gemini is last and never serves visitors in Europe", why: "Google's free tier may review content; the EU, EEA, UK and Switzerland are excluded and an unknown country counts as Europe." },
  { title: "OCR never uses Gemini's free tier", why: "Scans of IDs, contracts and invoices go through OCR." },
  { title: "Developer API jobs never use free tiers", why: "They go to a paid provider charged to the customer's credits." },
  { title: "One account per provider", why: "Stacking free quota with several accounts breaks the providers' terms." },
];

export function RoutingEditor({ caps, margin }: { caps: CapabilityView[]; margin: number }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Record<string, string[]>>(Object.fromEntries(caps.map((c) => [c.cap, c.order])));
  const [pct, setPct] = useState(Math.round(margin * 100));
  const [saved, setSaved] = useState<string | null>(null);
  const dirty = JSON.stringify(orders) !== JSON.stringify(Object.fromEntries(caps.map((c) => [c.cap, c.order]))) || pct !== Math.round(margin * 100);

  const move = (cap: string, i: number, dir: -1 | 1) => {
    const list = [...orders[cap]];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setOrders({ ...orders, [cap]: list });
  };
  const save = async () => {
    const res = await fetch("/api/admin/routing", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ routing: orders, margin: pct / 100 }) });
    setSaved(res.ok ? "Saved." : "Could not save.");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Routing</h1>
          <p className="max-w-[640px] text-sm text-ink-2">Set the order each AI tool tries providers in. The self-hosted fallback always runs last.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-teal-deep">{saved}</span>}
          <button type="button" disabled={!dirty} onClick={() => { setOrders(Object.fromEntries(caps.map((c) => [c.cap, c.order]))); setPct(Math.round(margin * 100)); }} className="h-10 rounded-lg border border-line-2 px-4 text-sm font-medium disabled:opacity-40">Discard</button>
          <button type="button" data-testid="save-routing" disabled={!dirty} onClick={save} className="h-10 rounded-lg bg-lapis px-4 text-sm font-semibold text-white hover:bg-lapis-deep disabled:opacity-40">Save order</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {caps.map((c) => (
          <section key={c.cap} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-col"><span className="text-base font-semibold">{TITLE[c.cap]?.title ?? c.cap}</span><span className="text-xs text-ink-2">{TITLE[c.cap]?.tools}</span></div>
            <ol className="flex flex-col gap-1.5" aria-label={`${c.cap} order`}>
              {orders[c.cap].map((id, i) => {
                const why = c.skipped[id];
                const pinned = id === "gemini";
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg border border-line bg-ground/50 px-3 py-2 text-sm">
                    <span className="w-5 text-center text-xs font-semibold text-ink-2 tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{c.names[id] ?? id}{pinned && <span className="ms-2 text-xs text-ink-3">always last</span>}</span>
                    {why !== undefined && <span className={`size-2 rounded-full ${why === "" ? "bg-teal" : /rejected/.test(why) ? "bg-red" : "bg-saffron"}`} title={why || "working"} />}
                    <span className="flex gap-0.5">
                      <button type="button" aria-label={`move ${c.names[id]} up`} disabled={i === 0 || pinned} onClick={() => move(c.cap, i, -1)} className="grid size-7 place-items-center rounded-md border border-line hover:border-ink-3 disabled:opacity-30">↑</button>
                      <button type="button" aria-label={`move ${c.names[id]} down`} disabled={i === orders[c.cap].length - 1 || pinned || orders[c.cap][i + 1] === "gemini"} onClick={() => move(c.cap, i, 1)} className="grid size-7 place-items-center rounded-md border border-line hover:border-ink-3 disabled:opacity-30">↓</button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <span className="text-xs text-ink-2">Last: {TITLE[c.cap]?.fallback}</span>
          </section>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <span className="text-base font-semibold">Safety margin</span>
          <p className="text-sm text-ink-2">Skip a free provider once it has used this much of its limit, so a burst of traffic never turns into a bill.</p>
          <label className="flex items-center gap-3 text-sm">
            <input type="range" min={50} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="flex-1 accent-lapis" aria-label="Safety margin" />
            <span className="w-12 text-end font-semibold tabular-nums">{pct}%</span>
          </label>
          <span className="text-xs text-ink-2">When every provider is unavailable, visitors see an error asking them to try later; the job is not charged.</span>
        </section>
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <span className="text-base font-semibold">Locked rules</span>
          <p className="text-sm text-ink-2">Set by provider terms and the privacy promise. They can only be changed in code.</p>
          <ul className="flex flex-col gap-2">
            {RULES.map((r) => <li key={r.title} className="flex flex-col text-sm"><span className="font-medium">{r.title}</span><span className="text-xs text-ink-2">{r.why}</span></li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
