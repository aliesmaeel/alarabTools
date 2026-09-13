"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_FONT, type FontId } from "@alarab/arabic";
import { LINE_HEIGHT, HIGHLIGHT, type Edit } from "@alarab/pdf-core/edit";
import type { ToolModule, WorkspaceProps } from "./types";
import { Field, inputCls } from "./fields";
import { FontSelect } from "./text-options";
import { openPdf, renderPage, thumbnail } from "@/lib/pdfjs";
import { ensureFont } from "@/lib/signature";

type Tool = "select" | "text" | "image" | "draw" | "rect" | "ellipse" | "highlight" | "whiteout";
type Item = Edit & { id: string };
type Style = { font: FontId; size: number; color: string; stroke: string; fill: string | null; strokeWidth: number };
type O = { edits: Item[]; page: number; selected: string | null; tool: Tool; style: Style };

const TOOLS: Tool[] = ["select", "text", "image", "draw", "rect", "ellipse", "highlight", "whiteout"];
let counter = 0;
const newId = () => `e${Date.now().toString(36)}${counter++}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function ColorInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />;
}

const ICONS: Record<Tool, string> = {
  select: "M5 3l14 8-6 2-3 6z",
  text: "M5 5h14M12 5v14M9 19h6",
  image: "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4",
  draw: "M4 20c4-8 8-8 8-4s4 4 8-4",
  rect: "M4 6h16v12H4z",
  ellipse: "M12 5a8 7 0 1 0 0 14a8 7 0 1 0 0-14",
  highlight: "M5 17h14M8 6l8 0-2 8H8z",
  whiteout: "M4 6h16v12H4zM8 10h8M8 14h5",
};

function Workspace({ files, value, onChange }: WorkspaceProps<O>) {
  const t = useTranslations("options.editPdf");
  const to = useTranslations("options");
  const file = files[0];
  const [pageCount, setPageCount] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [aspect, setAspect] = useState(1.414);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [families, setFamilies] = useState<Partial<Record<FontId, string>>>({});
  const [boxW, setBoxW] = useState(1);
  const history = useRef<Item[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ kind: "move" | "resize" | "create" | "draw"; id: string; sx: number; sy: number; start: Item } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<O>) => onChange({ ...value, ...patch });
  const push = () => { history.current = [...history.current.slice(-29), value.edits]; setCanUndo(true); };
  const commit = (edits: Item[], patch: Partial<O> = {}) => {
    push();
    onChange({ ...value, ...patch, edits });
  };
  const undo = () => {
    const prev = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (prev) onChange({ ...value, edits: prev, selected: null });
  };

  // Page preview and thumbnails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { doc, close } = await openPdf(file);
      if (cancelled) return close();
      setPageCount(doc.numPages);
      const canvas = await renderPage(doc, Math.min(value.page, doc.numPages - 1) + 1, { width: 1400 });
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
      for (let i = 1; i <= doc.numPages && !cancelled; i++) {
        urls.push(await thumbnail(doc, i, 90));
        setThumbs([...urls]);
      }
      await close();
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [file]);

  // Track the rendered page width so text sizes (fractions of the page width) become pixels.
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview]);

  const usedFonts = Array.from(new Set(value.edits.filter((e): e is Item & { kind: "text" } => e.kind === "text").map((e) => e.font as FontId).concat(value.style.font)));
  useEffect(() => {
    const missing = usedFonts.filter((f) => !families[f]);
    if (!missing.length) return;
    Promise.all(missing.map(async (f) => [f, await ensureFont(f)] as const)).then((pairs) => setFamilies((cur) => ({ ...cur, ...Object.fromEntries(pairs) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedFonts.join(","), families]);

  const selected = value.edits.find((e) => e.id === value.selected) ?? null;
  const onPage = value.edits.filter((e) => e.page === value.page);
  const update = (id: string, patch: Partial<Item>) => onChange({ ...value, edits: value.edits.map((e) => (e.id === id ? ({ ...e, ...patch } as Item) : e)) });
  const remove = (id: string) => commit(value.edits.filter((e) => e.id !== id), { selected: null });

  const frac = (e: ReactPointerEvent) => {
    const b = pageRef.current!.getBoundingClientRect();
    return { fx: clamp01((e.clientX - b.left) / b.width), fy: clamp01((e.clientY - b.top) / b.height) };
  };

  // Pointer down on empty page space: create something with the active tool.
  const onPageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.page) return;
    const { fx, fy } = frac(e);
    const s = value.style;
    const tool = value.tool;
    if (tool === "select") { set({ selected: null }); return; }
    if (tool === "text") {
      const item: Item = { id: newId(), kind: "text", page: value.page, x: fx, y: fy, w: 0.3, h: (s.size * LINE_HEIGHT) / aspect, text: t("newText"), font: s.font, size: s.size, color: s.color };
      commit([...value.edits, item], { selected: item.id, tool: "select" });
      return;
    }
    if (tool === "image") { imageInput.current?.click(); return; }
    const id = newId();
    let item: Item;
    if (tool === "draw") item = { id, kind: "draw", page: value.page, x: fx, y: fy, w: 0, h: 0, points: [[fx, fy]], color: s.stroke, strokeWidth: s.strokeWidth };
    else if (tool === "rect" || tool === "ellipse") item = { id, kind: tool, page: value.page, x: fx, y: fy, w: 0, h: 0, stroke: s.stroke, fill: s.fill, strokeWidth: s.strokeWidth };
    else item = { id, kind: tool, page: value.page, x: fx, y: fy, w: 0, h: 0 };
    gesture.current = { kind: tool === "draw" ? "draw" : "create", id, sx: fx, sy: fy, start: item };
    e.currentTarget.setPointerCapture(e.pointerId);
    commit([...value.edits, item], { selected: id });
  };
  const onItemDown = (item: Item, kind: "move" | "resize") => (e: ReactPointerEvent) => {
    e.stopPropagation();
    if (value.tool !== "select" && !(value.tool === "text" && item.kind === "text")) return;
    const { fx, fy } = frac(e);
    gesture.current = { kind, id: item.id, sx: fx, sy: fy, start: item };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    push();
    set({ selected: item.id });
  };
  const onMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const { fx, fy } = frac(e);
    const dx = fx - g.sx, dy = fy - g.sy;
    const s = g.start;
    if (g.kind === "move") update(g.id, { x: clamp01(s.x + dx), y: clamp01(s.y + dy) });
    else if (g.kind === "resize") update(g.id, { w: Math.max(0.02, s.w + dx), h: Math.max(0.01, s.h + dy) });
    else if (g.kind === "create") update(g.id, { x: Math.min(g.sx, fx), y: Math.min(g.sy, fy), w: Math.abs(dx), h: Math.abs(dy) });
    else if (g.kind === "draw" && s.kind === "draw") {
      const cur = value.edits.find((x) => x.id === g.id);
      if (cur?.kind === "draw") {
        const points: [number, number][] = [...cur.points, [fx, fy]];
        const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
        update(g.id, { points, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } as Partial<Item>);
      }
    }
  };
  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const cur = value.edits.find((x) => x.id === g.id);
    if (g.kind === "create" && cur && (cur.w < 0.005 || cur.h < 0.005)) onChange({ ...value, edits: value.edits.filter((x) => x.id !== g.id), selected: null });
  };

  const chooseImage = async (f: File | undefined) => {
    if (!f) return;
    const type = f.type === "image/png" ? "image/png" : "image/jpeg";
    let blob: Blob = f;
    if (f.type !== "image/png" && f.type !== "image/jpeg") {
      const bmp = await createImageBitmap(f);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      blob = await c.convertToBlob({ type: "image/png" });
    }
    const bmp = await createImageBitmap(blob);
    const ratio = bmp.height / bmp.width;
    bmp.close();
    // Placed in the middle of the current page right away; the user drags it from there.
    const w = 0.3, h = (w * ratio) / aspect;
    const item: Item = { id: newId(), kind: "image", page: value.page, x: 0.5 - w / 2, y: 0.5 - h / 2, w, h, bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type === "image/png" ? "image/png" : type, url: URL.createObjectURL(blob) };
    commit([...value.edits, item], { selected: item.id, tool: "select" });
  };

  const styleOf = (e: Item): React.CSSProperties => ({ left: `${e.x * 100}%`, top: `${e.y * 100}%`, width: `${e.w * 100}%`, height: `${e.h * 100}%` });
  const px = (frac: number) => frac * boxW;

  return (
    <div className="grid gap-4 lg:grid-cols-[88px_minmax(0,1fr)_280px]">
      {/* Page strip */}
      <ol className="flex gap-2 overflow-auto lg:max-h-[70vh] lg:flex-col" aria-label={t("pages")}>
        {Array.from({ length: pageCount }, (_, i) => (
          <li key={i} className="shrink-0">
            <button type="button" onClick={() => set({ page: i, selected: null })} aria-current={i === value.page} className={`w-[72px] rounded-md border-2 bg-surface p-0.5 ${i === value.page ? "border-lapis" : "border-line hover:border-ink-3"}`}>
              {thumbs[i] ? <img src={thumbs[i]} alt="" className="block w-full" /> : <div className="aspect-[1/1.4] w-full bg-ground" />}
              <span className="block py-0.5 text-center text-[11px] tabular-nums text-ink-2">{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* Page */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <button type="button" disabled={value.page === 0} onClick={() => set({ page: value.page - 1, selected: null })} className="h-9 rounded-md border border-line px-3 hover:border-ink-3 disabled:opacity-30">{t("prev")}</button>
          <span className="text-ink-2">{t("pageOf", { n: value.page + 1, total: pageCount || "…" })}</span>
          <button type="button" disabled={value.page >= pageCount - 1} onClick={() => set({ page: value.page + 1, selected: null })} className="h-9 rounded-md border border-line px-3 hover:border-ink-3 disabled:opacity-30">{t("next")}</button>
        </div>
        <div
          ref={pageRef}
          data-testid="page-preview"
          data-page="1"
          onPointerDown={onPageDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={`relative w-full select-none overflow-hidden rounded-lg border border-line bg-surface shadow-sm ${value.tool === "select" ? "" : value.tool === "draw" ? "cursor-crosshair" : "cursor-copy"}`}
          style={{ aspectRatio: `1 / ${aspect}`, touchAction: "none" }}
        >
          {preview ? <img src={preview} alt="" data-page="1" className="block h-full w-full" draggable={false} /> : <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">…</div>}
          <svg data-page="1" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
            {onPage.filter((e): e is Item & { kind: "draw" } => e.kind === "draw").map((e) => (
              <polyline key={e.id} points={e.points.map((p) => `${p[0]},${p[1]}`).join(" ")} fill="none" stroke={e.color} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: Math.max(1, px(e.strokeWidth)) }} />
            ))}
          </svg>
          {onPage.map((e) => {
            const active = e.id === value.selected;
            const ring = active ? "outline outline-2 outline-lapis" : "hover:outline hover:outline-1 hover:outline-lapis/60";
            if (e.kind === "draw") {
              return <div key={e.id} data-testid="edit-item" onPointerDown={onItemDown(e, "move")} className={`absolute ${ring}`} style={styleOf(e)} />;
            }
            if (e.kind === "text") {
              return (
                <div key={e.id} data-testid="edit-item" onPointerDown={onItemDown(e, "move")} className={`absolute cursor-move whitespace-pre text-start ${ring}`} dir="auto" style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%`, width: `${e.w * 100}%`, fontFamily: `"${families[e.font as FontId] ?? "sans-serif"}"`, fontSize: px(e.size), lineHeight: LINE_HEIGHT, color: e.color }}>
                  {e.text}
                </div>
              );
            }
            const inner =
              e.kind === "image" ? <img src={e.url} alt="" draggable={false} className="block h-full w-full" /> :
              e.kind === "highlight" ? <div className="h-full w-full mix-blend-multiply" style={{ background: HIGHLIGHT }} /> :
              e.kind === "whiteout" ? <div className="h-full w-full bg-white" /> :
              e.kind === "rect" || e.kind === "ellipse" ? <div className="h-full w-full" style={{ border: `${Math.max(1, px(e.strokeWidth))}px solid ${e.stroke}`, background: e.fill ?? "transparent", borderRadius: e.kind === "ellipse" ? "50%" : 0 }} /> : null;
            return (
              <div key={e.id} data-testid="edit-item" onPointerDown={onItemDown(e, "move")} className={`absolute cursor-move ${ring}`} style={styleOf(e)}>
                {inner}
                {active && <span data-testid="edit-resize" onPointerDown={onItemDown(e, "resize")} className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-lapis shadow" />}
              </div>
            );
          })}
        </div>
        <span className="text-xs text-ink-2">{t(`hint.${value.tool}`)}</span>
      </div>

      {/* Tools and properties */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-ground/60 p-3">
        <div className="grid grid-cols-4 gap-1" role="toolbar" aria-label={t("tools.select")}>
          {TOOLS.map((k) => (
            <button key={k} type="button" aria-pressed={value.tool === k} aria-label={t(`tools.${k}`)} title={t(`tools.${k}`)} onClick={() => (k === "image" ? imageInput.current?.click() : set({ tool: k, selected: null }))} className={`flex flex-col items-center gap-1 rounded-md py-2 text-[11px] font-medium ${value.tool === k ? "bg-lapis text-white" : "bg-surface hover:bg-lapis-soft"}`}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[k]} /></svg>
              {t(`tools.${k}`)}
            </button>
          ))}
        </div>
        <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("chooseImage")} onChange={(e) => { chooseImage(e.target.files?.[0]); e.target.value = ""; }} />

        {(value.tool === "text" || selected?.kind === "text") && (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            {selected?.kind === "text" && (
              <Field label={t("text")}>
                {(id) => <textarea id={id} rows={2} value={selected.text} onChange={(e) => update(selected.id, { text: e.target.value })} className={`${inputCls} h-auto py-2`} />}
              </Field>
            )}
            <FontSelect value={(selected?.kind === "text" ? selected.font : value.style.font) as FontId} onChange={(font) => { set({ style: { ...value.style, font } }); if (selected?.kind === "text") update(selected.id, { font }); }} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="flex justify-between"><span className="font-medium">{to("size")}</span><span className="tabular-nums text-ink-2">{Math.round((selected?.kind === "text" ? selected.size : value.style.size) * 1000) / 10}%</span></span>
              <input type="range" min={1} max={10} step={0.25} value={(selected?.kind === "text" ? selected.size : value.style.size) * 100} onChange={(e) => { const size = Number(e.target.value) / 100; set({ style: { ...value.style, size } }); if (selected?.kind === "text") update(selected.id, { size, h: (size * LINE_HEIGHT) / aspect }); }} className="accent-lapis" />
            </label>
            <Field label={to("color")}>{(id) => <ColorInput id={id} value={selected?.kind === "text" ? selected.color : value.style.color} onChange={(color) => { set({ style: { ...value.style, color } }); if (selected?.kind === "text") update(selected.id, { color }); }} />}</Field>
          </div>
        )}

        {(["draw", "rect", "ellipse"].includes(value.tool) || (selected && ["draw", "rect", "ellipse"].includes(selected.kind))) && (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <Field label={t("stroke")}>{(id) => <ColorInput id={id} value={value.style.stroke} onChange={(stroke) => { set({ style: { ...value.style, stroke } }); if (selected?.kind === "draw") update(selected.id, { color: stroke }); else if (selected && (selected.kind === "rect" || selected.kind === "ellipse")) update(selected.id, { stroke }); }} />}</Field>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("strokeWidth")}</span>
              <input type="range" min={0.1} max={2} step={0.1} value={value.style.strokeWidth * 100} onChange={(e) => { const strokeWidth = Number(e.target.value) / 100; set({ style: { ...value.style, strokeWidth } }); if (selected && (selected.kind === "draw" || selected.kind === "rect" || selected.kind === "ellipse")) update(selected.id, { strokeWidth }); }} className="accent-lapis" />
            </label>
            {(value.tool === "rect" || value.tool === "ellipse" || selected?.kind === "rect" || selected?.kind === "ellipse") && (
              <div className="flex items-end gap-2">
                <div className="flex-1"><Field label={t("fill")}>{(id) => <ColorInput id={id} value={value.style.fill ?? "#ffffff"} onChange={(fill) => { set({ style: { ...value.style, fill } }); if (selected && (selected.kind === "rect" || selected.kind === "ellipse")) update(selected.id, { fill }); }} />}</Field></div>
                <button type="button" onClick={() => { set({ style: { ...value.style, fill: null } }); if (selected && (selected.kind === "rect" || selected.kind === "ellipse")) update(selected.id, { fill: null }); }} className="h-10 rounded-lg border border-line px-3 text-sm hover:border-ink-3">{t("noFill")}</button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {selected && <button type="button" onClick={() => remove(selected.id)} className="h-9 rounded-md border border-red/40 px-3 text-sm font-medium text-red hover:bg-red/5">{t("delete")}</button>}
          <button type="button" disabled={!canUndo} onClick={undo} className="h-9 rounded-md border border-line px-3 text-sm font-medium hover:border-ink-3 disabled:opacity-40">{t("undo")}</button>
          {onPage.length > 0 && <button type="button" onClick={() => commit(value.edits.filter((e) => e.page !== value.page), { selected: null })} className="h-9 rounded-md border border-line px-3 text-sm font-medium hover:border-ink-3">{t("clearPage")}</button>}
        </div>
        <span className="text-xs text-ink-2">{t("edits", { count: value.edits.length })}</span>
      </div>
    </div>
  );
}

export const editPdf: ToolModule<O> = {
  defaults: { edits: [], page: 0, selected: null, tool: "select", style: { font: DEFAULT_FONT, size: 0.025, color: "#161b2f", stroke: "#b42318", fill: null, strokeWidth: 0.004 } },
  Workspace,
  validate: (o) => (o.edits.length ? null : "needEdits"),
  prepare: (o) => ({ ...o, edits: o.edits.map((e) => (e.kind === "image" ? { ...e, url: undefined } : e)) }),
};
