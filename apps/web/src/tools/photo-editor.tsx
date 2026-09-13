"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_FONT, type FontId } from "@alarab/arabic";
import { decode, encode, formatOf, EXT, MIME, type Format } from "@alarab/image-core";
import type { OptionsProps, ToolModule, WorkspaceProps } from "./types";
import type { Output, RunResult } from "@/workers/pdf.worker";
import { Checkbox, Field, RadioGroup, inputCls } from "./fields";
import { FontSelect } from "./text-options";
import { ensureFont } from "@/lib/signature";
import { DEFAULT_ADJUST, PRESETS, STICKERS, newLayer, renderPhoto, type Adjust, type Layer, type LayerBox, type PhotoState, type PresetId } from "@/lib/photo";

type O = PhotoState;
type Tab = "adjust" | "text" | "stickers" | "frame";
const PREVIEW_MAX = 1400;

function Slider({ id, label, value, min, max, step = 1, onChange, unit = "" }: { id: string; label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between"><span className="font-medium">{label}</span><span className="tabular-nums text-ink-2">{value}{unit}</span></span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-lapis" />
    </label>
  );
}

function ColorInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />;
}

/** Load the preview bitmap (HEIC goes through image-core) at a size that keeps the live preview quick. */
async function previewBitmap(file: File): Promise<ImageBitmap> {
  const full = await decode(file, PREVIEW_MAX);
  return createImageBitmap(full);
}

function Workspace({ files, value, onChange }: WorkspaceProps<O>) {
  const t = useTranslations("options.photoEditor");
  const to = useTranslations("options");
  const file = files[0];
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [families, setFamilies] = useState<Partial<Record<FontId, string>>>({});
  const [boxes, setBoxes] = useState<LayerBox[]>([]);
  const [tab, setTab] = useState<Tab>("adjust");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const set = (patch: Partial<O>) => onChange({ ...value, ...patch });

  useEffect(() => {
    let alive = true;
    previewBitmap(file).then((b) => { if (alive) setBitmap(b); else b.close(); });
    return () => { alive = false; };
  }, [file]);

  // Fonts used by text layers are loaded once into document.fonts; families are keyed by font id.
  const neededFonts = useMemo(() => Array.from(new Set(value.layers.filter((l) => l.kind === "text").map((l) => l.font))), [value.layers]);
  useEffect(() => {
    const missing = neededFonts.filter((f) => !families[f]);
    if (!missing.length) return;
    Promise.all(missing.map(async (f) => [f, await ensureFont(f)] as const)).then((pairs) => setFamilies((cur) => ({ ...cur, ...Object.fromEntries(pairs) })));
  }, [neededFonts, families]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    if (canvas.width !== bitmap.width) { canvas.width = bitmap.width; canvas.height = bitmap.height; }
    // One frame per change: coalesces slider drags and keeps setState out of the effect body.
    const frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d")!;
      setBoxes(renderPhoto(ctx, bitmap, bitmap.width, bitmap.height, value, families, 1));
    });
    return () => cancelAnimationFrame(frame);
  }, [bitmap, value, families]);

  const selected = value.layers.find((l) => l.id === value.selected) ?? null;
  const updateLayer = (id: string, patch: Partial<Layer>) => set({ layers: value.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLayer = (id: string) => set({ layers: value.layers.filter((l) => l.id !== id), selected: null });
  const addLayer = (kind: Layer["kind"], text: string) => {
    const layer = newLayer(kind, text, DEFAULT_FONT);
    set({ layers: [...value.layers, layer], selected: layer.id });
    setTab(kind === "text" ? "text" : "stickers");
  };
  const setAdjust = (patch: Partial<Adjust>) => set({ adjust: { ...value.adjust, ...patch }, preset: "none" });
  const applyPreset = (preset: PresetId) => set({ preset, adjust: { ...DEFAULT_ADJUST, ...PRESETS[preset] } });

  const onLayerDown = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const layer = value.layers.find((l) => l.id === id);
    if (!layer) return;
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: layer.x, oy: layer.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    set({ selected: id });
    setTab(layer.kind === "text" ? "text" : "stickers");
  };
  const onLayerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const { id, sx, sy, ox, oy } = drag.current;
    const x = Math.min(1, Math.max(0, ox + (e.clientX - sx) / rect.width));
    const y = Math.min(1, Math.max(0, oy + (e.clientY - sy) / rect.height));
    updateLayer(id, { x, y });
  };
  const onLayerUp = () => { drag.current = null; };

  const tabs: Tab[] = ["adjust", "text", "stickers", "frame"];
  const presets = Object.keys(PRESETS) as PresetId[];
  const W = bitmap?.width ?? 1, H = bitmap?.height ?? 1;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="relative mx-auto w-full max-w-[900px] select-none">
        {!bitmap && <div className="aspect-[4/3] w-full rounded-lg bg-ground" aria-busy="true" />}
        <canvas ref={canvasRef} data-testid="photo-canvas" className={`block w-full rounded-lg bg-ground ${bitmap ? "" : "hidden"}`} onPointerDown={() => set({ selected: null })} />
        {bitmap && boxes.map((b) => {
          const layer = value.layers.find((l) => l.id === b.id);
          if (!layer) return null;
          const active = layer.id === value.selected;
          return (
            <button
              key={b.id}
              type="button"
              aria-label={layer.text}
              data-testid="photo-layer"
              onPointerDown={onLayerDown(b.id)}
              onPointerMove={onLayerMove}
              onPointerUp={onLayerUp}
              onPointerCancel={onLayerUp}
              className={`absolute cursor-move touch-none rounded-sm border ${active ? "border-lapis shadow-[0_0_0_1px_white]" : "border-transparent hover:border-white/70"}`}
              style={{ left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` }}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-line bg-ground/60 p-3">
        <div role="tablist" className="grid grid-cols-4 gap-1 rounded-lg bg-surface p-1">
          {tabs.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-9 rounded-md text-sm font-medium ${tab === k ? "bg-lapis text-white" : "hover:bg-ground"}`}>{t(`tabs.${k}`)}</button>
          ))}
        </div>

        {tab === "adjust" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("presets")}>
              {presets.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={value.preset === p} onClick={() => applyPreset(p)} className={`h-8 rounded-md border px-2.5 text-xs font-medium ${value.preset === p ? "border-lapis bg-lapis text-white" : "border-line bg-surface hover:border-ink-3"}`}>{t(`preset.${p}`)}</button>
              ))}
            </div>
            <Slider id="pe-brightness" label={t("brightness")} value={value.adjust.brightness} min={0} max={200} onChange={(brightness) => setAdjust({ brightness })} unit="%" />
            <Slider id="pe-contrast" label={t("contrast")} value={value.adjust.contrast} min={0} max={200} onChange={(contrast) => setAdjust({ contrast })} unit="%" />
            <Slider id="pe-saturation" label={t("saturation")} value={value.adjust.saturation} min={0} max={200} onChange={(saturation) => setAdjust({ saturation })} unit="%" />
            <Slider id="pe-hue" label={t("hue")} value={value.adjust.hue} min={-180} max={180} onChange={(hue) => setAdjust({ hue })} unit="°" />
            <Slider id="pe-blur" label={t("blur")} value={value.adjust.blur} min={0} max={20} onChange={(blur) => setAdjust({ blur })} />
            <Slider id="pe-grayscale" label={t("grayscale")} value={value.adjust.grayscale} min={0} max={100} onChange={(grayscale) => setAdjust({ grayscale })} unit="%" />
            <Slider id="pe-sepia" label={t("sepia")} value={value.adjust.sepia} min={0} max={100} onChange={(sepia) => setAdjust({ sepia })} unit="%" />
            <Checkbox checked={value.adjust.invert} onChange={(invert) => setAdjust({ invert })} label={t("invert")} />
            <button type="button" onClick={() => applyPreset("none")} className="self-start text-sm font-medium text-lapis hover:underline">{t("reset")}</button>
          </div>
        )}

        {tab === "text" && (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => addLayer("text", t("newText"))} className="h-10 rounded-lg border border-lapis px-3 text-sm font-medium text-lapis hover:bg-lapis-soft">{t("addText")}</button>
            {value.layers.filter((l) => l.kind === "text").length > 0 && (
              <ul className="flex flex-col gap-1">
                {value.layers.filter((l) => l.kind === "text").map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => set({ selected: l.id })} className={`w-full truncate rounded-md border px-2.5 py-1.5 text-start text-sm ${l.id === value.selected ? "border-lapis bg-lapis-soft" : "border-line bg-surface"}`}>{l.text || "…"}</button>
                  </li>
                ))}
              </ul>
            )}
            {selected && selected.kind === "text" && (
              <div className="flex flex-col gap-3 border-t border-line pt-3">
                <Field label={t("text")}>
                  {(id) => <textarea id={id} rows={2} value={selected.text} onChange={(e) => updateLayer(selected.id, { text: e.target.value })} className={`${inputCls} h-auto py-2`} />}
                </Field>
                <FontSelect value={selected.font} onChange={(font) => updateLayer(selected.id, { font })} />
                <Slider id="pe-text-size" label={to("size")} value={selected.size} min={2} max={40} onChange={(size) => updateLayer(selected.id, { size })} unit="%" />
                <Field label={to("color")}>{(id) => <ColorInput id={id} value={selected.color} onChange={(color) => updateLayer(selected.id, { color })} />}</Field>
                <Checkbox checked={selected.outline} onChange={(outline) => updateLayer(selected.id, { outline })} label={t("outline")} />
                <button type="button" onClick={() => removeLayer(selected.id)} className="self-start text-sm font-medium text-red hover:underline">{t("removeLayer")}</button>
              </div>
            )}
            <span className="text-xs text-ink-2">{t("dragHint")}</span>
          </div>
        )}

        {tab === "stickers" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-6 gap-1">
              {STICKERS.map((s) => (
                <button key={s} type="button" aria-label={s} onClick={() => addLayer("sticker", s)} className="grid aspect-square place-items-center rounded-md bg-surface text-2xl hover:bg-lapis-soft">{s}</button>
              ))}
            </div>
            {selected && selected.kind === "sticker" && (
              <div className="flex flex-col gap-3 border-t border-line pt-3">
                <Slider id="pe-sticker-size" label={to("size")} value={selected.size} min={4} max={60} onChange={(size) => updateLayer(selected.id, { size })} unit="%" />
                <button type="button" onClick={() => removeLayer(selected.id)} className="self-start text-sm font-medium text-red hover:underline">{t("removeLayer")}</button>
              </div>
            )}
            <span className="text-xs text-ink-2">{t("dragHint")}</span>
          </div>
        )}

        {tab === "frame" && (
          <div className="flex flex-col gap-3">
            <Slider id="pe-frame-width" label={t("frameWidth")} value={value.frame.width} min={0} max={15} step={0.5} onChange={(width) => set({ frame: { ...value.frame, width } })} unit="%" />
            <Slider id="pe-frame-radius" label={t("frameRadius")} value={value.frame.radius} min={0} max={25} step={0.5} onChange={(radius) => set({ frame: { ...value.frame, radius } })} unit="%" />
            <Field label={to("color")}>{(id) => <ColorInput id={id} value={value.frame.color} onChange={(color) => set({ frame: { ...value.frame, color } })} />}</Field>
          </div>
        )}
      </div>
    </div>
  );
}

function Options({ value, onChange }: OptionsProps<O>) {
  const t = useTranslations("options.photoEditor");
  return (
    <RadioGroup name="pe-format" value={value.format} onChange={(format) => onChange({ ...value, format })} options={[{ value: "same", label: t("formatSame") }, { value: "jpeg", label: "JPG" }, { value: "png", label: "PNG" }]} />
  );
}

async function run(files: File[], o: O, onProgress: (done: number, total: number) => void): Promise<RunResult> {
  try {
    const file = files[0];
    const img = await decode(file);
    const bitmap = await createImageBitmap(img);
    const families: Partial<Record<FontId, string>> = {};
    for (const l of o.layers) if (l.kind === "text" && !families[l.font]) families[l.font] = await ensureFont(l.font);
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    renderPhoto(ctx, bitmap, img.width, img.height, o, families, 1);
    bitmap.close();
    const out = ctx.getImageData(0, 0, img.width, img.height);
    const format: Format = o.format === "same" ? (formatOf(file.type) ?? "jpeg") : o.format;
    const bytes = await encode(out, format, { quality: 92 });
    const outputs: Output[] = [{ name: `${file.name.replace(/\.[^.]+$/, "")}-edited.${EXT[format]}`, bytes, mime: MIME[format] }];
    onProgress(1, 1);
    return { ok: true, outputs };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "error", message: /decod|bitmap|source image/i.test(message) ? "undecodable" : message };
  }
}

export const photoEditor: ToolModule<O> = {
  defaults: { preset: "none", adjust: DEFAULT_ADJUST, layers: [], frame: { width: 0, color: "#ffffff", radius: 0 }, format: "same", selected: null },
  Workspace,
  Options,
  runOnMain: (files, o, p) => run(files, o as O, p),
};
