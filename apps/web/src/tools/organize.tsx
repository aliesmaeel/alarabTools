"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import type { ToolModule, WorkspaceProps } from "./types";
import { openPdf, thumbnail } from "@/lib/pdfjs";

export type PageState = { index: number; rotation: 0 | 90 | 180 | 270; removed: boolean };
type O = { pages: PageState[] };

function Workspace({ files, value, onChange }: WorkspaceProps<O>) {
  const t = useTranslations("options.organize");
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const file = files[0];

  // Render thumbnails once per file and seed the page list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { doc, close } = await openPdf(file);
        if (cancelled) return close();
        const n = doc.numPages;
        setThumbs([]);
        onChange({ pages: Array.from({ length: n }, (_, index) => ({ index, rotation: 0, removed: false })) });
        const urls: string[] = [];
        for (let i = 1; i <= n && !cancelled; i++) {
          urls.push(await thumbnail(doc, i, 150));
          setThumbs([...urls]);
        }
        await close();
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const pages = value.pages ?? [];
  const update = (next: PageState[]) => onChange({ pages: next });
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= pages.length) return;
    const next = [...pages];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  };
  const rotate = (pos: number) => update(pages.map((p, i) => (i === pos ? { ...p, rotation: ((p.rotation + 90) % 360) as PageState["rotation"] } : p)));
  const toggle = (pos: number) => update(pages.map((p, i) => (i === pos ? { ...p, removed: !p.removed } : p)));

  function onDrop(e: DragEvent, to: number) {
    e.preventDefault();
    if (dragFrom.current !== null) move(dragFrom.current, to);
    dragFrom.current = null;
  }

  if (error) return <p role="alert" className="text-sm text-red">{t("failed")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">{t("hint")}</p>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {pages.map((p, pos) => (
          <li
            key={p.index}
            draggable
            onDragStart={() => { dragFrom.current = pos; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, pos)}
            className={`flex flex-col gap-2 rounded-xl border p-2 ${p.removed ? "border-dashed border-line opacity-40" : "border-line bg-ground"}`}
          >
            <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-surface">
              {thumbs[p.index] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[p.index]} alt={t("pageAlt", { n: p.index + 1 })} className="max-h-full max-w-full shadow-sm" style={{ transform: `rotate(${p.rotation}deg)${p.rotation % 180 ? " scale(0.75)" : ""}` }} draggable={false} />
              ) : (
                <span className="text-xs text-ink-3">…</span>
              )}
              <span className="absolute start-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-lapis text-xs font-semibold text-white tabular-nums">{pos + 1}</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button type="button" aria-label={t("moveBack")} disabled={pos === 0} onClick={() => move(pos, pos - 1)} className="grid size-8 place-items-center rounded-md border border-line bg-surface hover:border-ink-3 disabled:opacity-30"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-none stroke-current stroke-2 rtl:-scale-x-100" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>
              <button type="button" aria-label={t("rotate")} onClick={() => rotate(pos)} className="grid size-8 place-items-center rounded-md border border-line bg-surface hover:border-ink-3">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>
              </button>
              <button type="button" aria-label={p.removed ? t("restore") : t("remove")} aria-pressed={p.removed} onClick={() => toggle(pos)} className="grid size-8 place-items-center rounded-md border border-line bg-surface hover:border-red hover:text-red">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round"><path d={p.removed ? "M5 12l5 5 9-10" : "M6 6l12 12M18 6L6 18"} /></svg>
              </button>
              <button type="button" aria-label={t("moveForward")} disabled={pos === pages.length - 1} onClick={() => move(pos, pos + 1)} className="grid size-8 place-items-center rounded-md border border-line bg-surface hover:border-ink-3 disabled:opacity-30"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-none stroke-current stroke-2 rtl:-scale-x-100 -scale-x-100 rtl:scale-x-100" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const organizePdf: ToolModule<O> = {
  defaults: { pages: [] },
  Workspace,
  validate: (o) => (o.pages.some((p) => !p.removed) ? null : "needOnePage"),
};
