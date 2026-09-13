"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FONTS, type FontId } from "@alarab/arabic";
import type { ToolModule, WorkspaceProps } from "./types";
import { openPdf, renderPage } from "@/lib/pdfjs";
import { trimAndExport, typedSignature, uploadedSignature, type SignatureImage } from "@/lib/signature";
import { Checkbox, TextInput, inputCls } from "./fields";

type O = {
  sig: Uint8Array | null;
  sigUrl: string | null;
  sigRatio: number; // height / width
  page: number; // 0-based
  x: number; // fractions of the displayed page
  y: number;
  w: number;
  allPages: boolean;
};

type Tab = "draw" | "type" | "upload";

function DrawPad({ onChange }: { onChange: (img: SignatureImage | null) => void }) {
  const t = useTranslations("options.sign");
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const pos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const start = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#161b2f";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  };
  const end = async () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(await trimAndExport(ref.current!));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={ref}
        width={900}
        height={300}
        aria-label={t("padLabel")}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="aspect-[3/1] w-full cursor-crosshair touch-none rounded-lg border border-line-2 bg-surface"
      />
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>{t("padHint")}</span>
        <button type="button" onClick={clear} className="font-medium text-lapis">{t("clear")}</button>
      </div>
    </div>
  );
}

function Workspace({ files, value, onChange }: WorkspaceProps<O>) {
  const t = useTranslations("options.sign");
  const locale = useLocale() as "ar" | "en";
  const file = files[0];
  const [tab, setTab] = useState<Tab>("draw");
  const [typed, setTyped] = useState("");
  const [font, setFont] = useState<FontId>("aref-ruqaa");
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

  const setSig = (img: SignatureImage | null) => onChange({ ...value, sig: img?.bytes ?? null, sigUrl: img?.url ?? null, sigRatio: img ? img.height / img.width : 1 });

  useEffect(() => {
    if (tab !== "type") return;
    const handle = setTimeout(() => typedSignature(typed, font).then(setSig), 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, font, tab]);

  // Drag the placed signature around the page.
  const onPointerDown = (e: ReactPointerEvent<HTMLImageElement>) => {
    const box = pageRef.current!.getBoundingClientRect();
    drag.current = { dx: (e.clientX - box.left) / box.width - value.x, dy: (e.clientY - box.top) / box.height - value.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLImageElement>) => {
    if (!drag.current) return;
    const box = pageRef.current!.getBoundingClientRect();
    const h = (value.w * value.sigRatio) / aspect;
    const x = Math.min(1 - value.w, Math.max(0, (e.clientX - box.left) / box.width - drag.current.dx));
    const y = Math.min(1 - h, Math.max(0, (e.clientY - box.top) / box.height - drag.current.dy));
    onChange({ ...value, x, y });
  };
  const onPointerUp = () => { drag.current = null; };
  const placeAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!value.sigUrl || drag.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    const h = (value.w * value.sigRatio) / aspect;
    onChange({ ...value, x: Math.min(1 - value.w, Math.max(0, (e.clientX - box.left) / box.width - value.w / 2)), y: Math.min(1 - h, Math.max(0, (e.clientY - box.top) / box.height - h / 2)) });
  };

  const tabCls = (k: Tab) => `h-10 flex-1 rounded-lg text-sm font-medium ${tab === k ? "bg-lapis text-white" : "bg-ground text-ink hover:bg-line"}`;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "draw"} onClick={() => setTab("draw")} className={tabCls("draw")}>{t("draw")}</button>
          <button type="button" role="tab" aria-selected={tab === "type"} onClick={() => setTab("type")} className={tabCls("type")}>{t("type")}</button>
          <button type="button" role="tab" aria-selected={tab === "upload"} onClick={() => setTab("upload")} className={tabCls("upload")}>{t("upload")}</button>
        </div>
        {tab === "draw" && <DrawPad onChange={setSig} />}
        {tab === "type" && (
          <div className="flex flex-col gap-3">
            <TextInput value={typed} placeholder={t("typePlaceholder")} onChange={(e) => setTyped(e.target.value)} className="text-lg" aria-label={t("type")} />
            <select value={font} onChange={(e) => setFont(e.target.value as FontId)} className={inputCls} aria-label={t("font")}>
              {FONTS.map((f) => <option key={f.id} value={f.id}>{f.name[locale]}</option>)}
            </select>
          </div>
        )}
        {tab === "upload" && (
          <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t("upload")} onChange={(e) => e.target.files?.[0] && uploadedSignature(e.target.files[0]).then(setSig)} className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-lapis-soft file:px-3 file:py-2 file:font-medium file:text-lapis" />
        )}
        {value.sigUrl && (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-ground p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.sigUrl} alt={t("previewAlt")} className="max-h-16 max-w-[60%] object-contain" />
            <label className="flex flex-1 flex-col gap-1 text-xs text-ink-2">
              {t("size")}
              <input type="range" min={10} max={60} value={Math.round(value.w * 100)} onChange={(e) => onChange({ ...value, w: Number(e.target.value) / 100 })} className="accent-lapis" />
            </label>
          </div>
        )}
        <Checkbox checked={value.allPages} onChange={(allPages) => onChange({ ...value, allPages })} label={t("allPages")} />
      </div>

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
          {value.sigUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.sigUrl}
              alt={t("placedAlt")}
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
        <span className="text-xs text-ink-2">{t("placeHint")}</span>
      </div>
    </div>
  );
}

export const signPdf: ToolModule<O> = {
  defaults: { sig: null, sigUrl: null, sigRatio: 0.4, page: 0, x: 0.55, y: 0.78, w: 0.3, allPages: false },
  Workspace,
  validate: (o) => (o.sig ? null : "needSignature"),
};
