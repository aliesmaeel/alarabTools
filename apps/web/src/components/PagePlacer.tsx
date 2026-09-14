"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { openPdf, renderPage } from "@/lib/pdfjs";

/** Where an image goes on a page: 0-based page, then fractions of the displayed page. */
export type Placement = { page: number; x: number; y: number; w: number };

/**
 * Page preview with an image the visitor places by clicking or dragging (signatures, stamps).
 * The placement is in fractions of the displayed page so the worker can map it to PDF space.
 */
export function PagePlacer({ file, imageUrl, ratio, value, onChange, imageAlt, hint }: {
  file: File;
  /** Object URL of the image to place; null until the visitor has made one. */
  imageUrl: string | null;
  /** Image height / width. */
  ratio: number;
  value: Placement;
  onChange: (next: Placement) => void;
  imageAlt: string;
  /** Replaces the default "click to place the signature" hint. */
  hint?: string;
}) {
  const t = useTranslations("options.sign");
  const [pageCount, setPageCount] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [aspect, setAspect] = useState(1.414);
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // Render the current page preview.
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

  const clamp = (x: number, y: number) => {
    const h = (value.w * ratio) / aspect;
    return { x: Math.min(1 - value.w, Math.max(0, x)), y: Math.min(1 - h, Math.max(0, y)) };
  };

  // Drag the placed image around the page.
  const onPointerDown = (e: ReactPointerEvent<HTMLImageElement>) => {
    const box = pageRef.current!.getBoundingClientRect();
    drag.current = { dx: (e.clientX - box.left) / box.width - value.x, dy: (e.clientY - box.top) / box.height - value.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLImageElement>) => {
    if (!drag.current) return;
    const box = pageRef.current!.getBoundingClientRect();
    onChange({ ...value, ...clamp((e.clientX - box.left) / box.width - drag.current.dx, (e.clientY - box.top) / box.height - drag.current.dy) });
  };
  const onPointerUp = () => { drag.current = null; };
  const placeAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!imageUrl || drag.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    const h = (value.w * ratio) / aspect;
    onChange({ ...value, ...clamp((e.clientX - box.left) / box.width - value.w / 2, (e.clientY - box.top) / box.height - h / 2) });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <button type="button" disabled={value.page === 0} onClick={() => onChange({ ...value, page: value.page - 1 })} className="h-9 rounded-md border border-line px-3 hover:border-ink-3 disabled:opacity-30">{t("prev")}</button>
        <span className="text-ink-2">{t("pageOf", { n: value.page + 1, total: pageCount || "…" })}</span>
        <button type="button" disabled={value.page >= pageCount - 1} onClick={() => onChange({ ...value, page: value.page + 1 })} className="h-9 rounded-md border border-line px-3 hover:border-ink-3 disabled:opacity-30">{t("next")}</button>
      </div>
      <div
        ref={pageRef}
        onClick={placeAt}
        data-testid="page-preview"
        className="relative w-full select-none overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
        style={{ aspectRatio: `1 / ${aspect}` }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="block h-full w-full" draggable={false} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">…</div>
        )}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={imageAlt}
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={(e) => e.stopPropagation()}
            className="absolute cursor-move touch-none rounded border border-dashed border-lapis"
            style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%`, width: `${value.w * 100}%` }}
          />
        )}
      </div>
      <span className="text-xs text-ink-2">{hint ?? t("placeHint")}</span>
    </div>
  );
}
