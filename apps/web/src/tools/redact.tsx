"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import type { ToolModule, WorkspaceProps } from "./types";
import { openPdf, renderPage, thumbnail } from "@/lib/pdfjs";

/** Areas to remove, as fractions of the displayed page. The worker rasterises those pages so the content is really gone. */
type Box = { id: string; page: number; x: number; y: number; w: number; h: number };
type O = { boxes: Box[]; page: number };

let counter = 0;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function Workspace({ files, value, onChange }: WorkspaceProps<O>) {
  const t = useTranslations("options.redact");
  const file = files[0];
  const [pageCount, setPageCount] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [aspect, setAspect] = useState(1.414);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { doc, close } = await openPdf(file);
      if (cancelled) return close();
      setPageCount(doc.numPages);
      const canvas = await renderPage(doc, Math.min(value.page, doc.numPages - 1) + 1, { width: 1200 });
      if (!cancelled) {
        setAspect(canvas.height / canvas.width);
        setPreview(canvas.toDataURL("image/jpeg", 0.85));
      }
      canvas.width = 0;
      await close();
    })().catch(() => setPreview(null));
    return () => { cancelled = true; };
  }, [file, value.page]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { doc, close } = await openPdf(file);
      const urls: string[] = [];
      for (let i = 1; i <= doc.numPages && !cancelled; i++) { urls.push(await thumbnail(doc, i, 90)); setThumbs([...urls]); }
      await close();
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [file]);

  const frac = (e: ReactPointerEvent) => {
    const b = pageRef.current!.getBoundingClientRect();
    return { fx: clamp01((e.clientX - b.left) / b.width), fy: clamp01((e.clientY - b.top) / b.height) };
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { fx, fy } = frac(e);
    const id = `r${Date.now().toString(36)}${counter++}`;
    drag.current = { id, sx: fx, sy: fy };
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange({ ...value, boxes: [...value.boxes, { id, page: value.page, x: fx, y: fy, w: 0, h: 0 }] });
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const { fx, fy } = frac(e);
    onChange({ ...value, boxes: value.boxes.map((b) => (b.id === d.id ? { ...b, x: Math.min(d.sx, fx), y: Math.min(d.sy, fy), w: Math.abs(fx - d.sx), h: Math.abs(fy - d.sy) } : b)) });
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    onChange({ ...value, boxes: value.boxes.filter((b) => b.id !== d.id || (b.w > 0.005 && b.h > 0.005)) });
  };
  const onPage = value.boxes.filter((b) => b.page === value.page);

  return (
    <div className="grid gap-4 lg:grid-cols-[88px_minmax(0,1fr)]">
      <ol className="flex gap-2 overflow-auto lg:max-h-[70vh] lg:flex-col" aria-label={t("pages")}>
        {Array.from({ length: pageCount }, (_, i) => {
          const n = value.boxes.filter((b) => b.page === i).length;
          return (
            <li key={i} className="shrink-0">
              <button type="button" onClick={() => onChange({ ...value, page: i })} aria-current={i === value.page} className={`relative w-[72px] rounded-md border-2 bg-surface p-0.5 ${i === value.page ? "border-lapis" : "border-line hover:border-ink-3"}`}>
                {thumbs[i] ? <img src={thumbs[i]} alt="" className="block w-full" /> : <div className="aspect-[1/1.4] w-full bg-ground" />}
                <span className="block py-0.5 text-center text-[11px] tabular-nums text-ink-2">{i + 1}</span>
                {n > 0 && <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white">{n}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex min-w-0 flex-col gap-2">
        <div ref={pageRef} data-testid="page-preview" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="relative w-full cursor-crosshair select-none overflow-hidden rounded-lg border border-line bg-surface shadow-sm" style={{ aspectRatio: `1 / ${aspect}`, touchAction: "none" }}>
          {preview ? <img src={preview} alt="" className="block h-full w-full" draggable={false} /> : <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">…</div>}
          {onPage.map((b) => (
            <div key={b.id} data-testid="redact-box" className="absolute bg-ink/90 outline outline-1 outline-white/60" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>
              <button type="button" aria-label={t("remove")} onPointerDown={(e) => e.stopPropagation()} onClick={() => onChange({ ...value, boxes: value.boxes.filter((x) => x.id !== b.id) })} className="absolute -end-2 -top-2 grid size-5 place-items-center rounded-full bg-white text-xs text-ink shadow">×</button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-ink-2">
          <span>{t("hint")}</span>
          <span>{t("count", { count: value.boxes.length })}</span>
        </div>
      </div>
    </div>
  );
}

export const redactPdf: ToolModule<O> = {
  defaults: { boxes: [], page: 0 },
  Workspace,
  validate: (o) => (o.boxes.length ? null : "needBoxes"),
};
