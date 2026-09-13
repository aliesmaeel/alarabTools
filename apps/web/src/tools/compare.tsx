"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ToolModule, WorkspaceProps } from "./types";
import { openPdf, renderPage, type PdfHandle } from "@/lib/pdfjs";

type O = { page: number };
type PageView = { a: string | null; b: string | null; diff: string | null; pct: number | null };

const WIDTH = 700;

/** Render page `n` of both documents and paint a magenta overlay where pixels differ. */
async function diffPage(a: PdfHandle, b: PdfHandle, n: number): Promise<PageView> {
  const ca = n <= a.doc.numPages ? await renderPage(a.doc, n, { width: WIDTH }) : null;
  const cb = n <= b.doc.numPages ? await renderPage(b.doc, n, { width: WIDTH }) : null;
  const view: PageView = { a: ca?.toDataURL("image/jpeg", 0.8) ?? null, b: cb?.toDataURL("image/jpeg", 0.8) ?? null, diff: null, pct: null };
  if (ca && cb) {
    const w = Math.min(ca.width, cb.width);
    const h = Math.min(ca.height, cb.height);
    const da = ca.getContext("2d")!.getImageData(0, 0, w, h).data;
    const db = cb.getContext("2d")!.getImageData(0, 0, w, h).data;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    let changed = 0;
    for (let i = 0; i < w * h * 4; i += 4) {
      const delta = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (delta > 60) {
        changed++;
        img.data[i] = 220; img.data[i + 1] = 30; img.data[i + 2] = 120; img.data[i + 3] = 255;
      } else {
        // faded copy of A as context
        const g = (da[i] + da[i + 1] + da[i + 2]) / 3;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 200 + g * 0.2;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    view.diff = out.toDataURL("image/png");
    view.pct = Math.round((changed / (w * h)) * 1000) / 10;
    out.width = 0;
  }
  if (ca) ca.width = 0;
  if (cb) cb.width = 0;
  return view;
}

function Workspace({ files, value, onChange }: WorkspaceProps<O>) {
  const t = useTranslations("options.compare");
  const [handles, setHandles] = useState<[PdfHandle, PdfHandle] | null>(null);
  const [view, setView] = useState<PageView | null>(null);
  const [changedPages, setChangedPages] = useState<number[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [fa, fb] = files;
  const total = handles ? Math.max(handles[0].doc.numPages, handles[1].doc.numPages) : 0;
  const page = Math.max(0, Math.min(value.page ?? 0, Math.max(0, total - 1)));

  useEffect(() => {
    if (!fa || !fb) return;
    let cancelled = false;
    let opened: [PdfHandle, PdfHandle] | null = null;
    Promise.all([openPdf(fa), openPdf(fb)]).then((h) => {
      if (cancelled) return h.forEach((x) => x.close());
      opened = h as [PdfHandle, PdfHandle];
      setHandles(opened);
      setChangedPages(null);
    });
    return () => {
      cancelled = true;
      opened?.forEach((x) => x.close());
    };
  }, [fa, fb]);

  useEffect(() => {
    if (!handles) return;
    let cancelled = false;
    diffPage(handles[0], handles[1], page + 1).then((v) => { if (!cancelled) setView(v); });
    return () => { cancelled = true; };
  }, [handles, page]);

  async function checkAll() {
    if (!handles) return;
    setChecking(true);
    const changed: number[] = [];
    for (let n = 1; n <= total; n++) {
      const v = await diffPage(handles[0], handles[1], n);
      if (v.pct === null || v.pct > 0) changed.push(n);
    }
    setChangedPages(changed);
    setChecking(false);
  }

  if (files.length < 2) return <p className="text-sm text-ink-2">{t("needTwo")}</p>;
  if (!handles) return <p className="text-sm text-ink-2">{t("loading")}</p>;

  const pane = (label: string, src: string | null, missingText: string) => (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="text-xs font-semibold text-ink-2">{label}</figcaption>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={label} className="block w-full" /> : <div className="grid aspect-[3/4] place-items-center p-4 text-center text-xs text-ink-3">{missingText}</div>}
      </div>
    </figure>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <button type="button" disabled={page === 0} onClick={() => onChange({ page: page - 1 })} className="h-9 rounded-md border border-line px-3 hover:border-ink-3 disabled:opacity-30">{t("prev")}</button>
          <span className="text-ink-2">{t("pageOf", { n: page + 1, total })}</span>
          <button type="button" disabled={page >= total - 1} onClick={() => onChange({ page: page + 1 })} className="h-9 rounded-md border border-line px-3 hover:border-ink-3 disabled:opacity-30">{t("next")}</button>
        </div>
        <span data-testid="diff-summary" className={`rounded-md px-2.5 py-1 text-xs font-semibold ${view?.pct === null || view?.pct === undefined ? "bg-saffron-soft text-saffron-deep" : view.pct > 0 ? "bg-[#fdecea] text-red" : "bg-teal-soft text-teal-deep"}`}>
          {!view ? "…" : view.pct === null ? t("missing") : view.pct > 0 ? t("changed", { pct: view.pct }) : t("same")}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {pane(t("fileA"), view?.a ?? null, t("missing"))}
        {pane(t("fileB"), view?.b ?? null, t("missing"))}
        {pane(t("diff"), view?.diff ?? null, t("missing"))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={checkAll} disabled={checking} className="h-10 rounded-lg border border-line-2 bg-surface px-4 font-medium hover:border-ink-3 disabled:opacity-50">{t("checkAll")}</button>
        {changedPages && <span data-testid="changed-pages" className="text-ink-2">{changedPages.length ? t("changedPages", { list: changedPages.join(", ") }) : t("noChanges")}</span>}
      </div>
    </div>
  );
}

export const comparePdf: ToolModule<O> = {
  defaults: { page: 0 },
  Workspace,
  noRun: true,
};
