"use client";

import { useTranslations } from "next-intl";
import { decode, encode, formatOf, EXT, MIME, type Format } from "@alarab/image-core";
import type { OptionsProps, ToolModule } from "./types";
import type { Output, RunResult } from "@/workers/pdf.worker";
import { RadioGroup } from "./fields";

type O = { scale: "2" | "4"; format: "same" | "png" | "jpeg" };

/**
 * ESRGAN-slim through UpscalerJS on TensorFlow.js, all served from /codecs/upscaler and run on the
 * visitor's GPU/CPU; nothing is uploaded. Scripts are UMD builds loaded once on the main thread.
 */
type UpscalerCtor = new (o: { model: unknown }) => { upscale: (src: HTMLCanvasElement, o: { patchSize: number; padding: number; output: "base64"; progress?: (rate: number) => void }) => Promise<string>; dispose: () => Promise<void> };
type Win = Window & { tf?: unknown; Upscaler?: UpscalerCtor; ESRGANSlim2x?: { path: string }; ESRGANSlim4x?: { path: string } };

const loaded = new Map<string, Promise<void>>();
function script(src: string): Promise<void> {
  let p = loaded.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => { loaded.delete(src); reject(new Error(`failed to load ${src}`)); };
      document.head.appendChild(el);
    });
    loaded.set(src, p);
  }
  return p;
}

const MAX_PIXELS: Record<O["scale"], number> = { "2": 1_200_000, "4": 400_000 };

async function run(files: File[], o: O, onProgress: (done: number, total: number) => void): Promise<RunResult> {
  try {
    await script("/codecs/upscaler/tf.min.js");
    await script("/codecs/upscaler/upscaler.min.js");
    await script(`/codecs/upscaler/esrgan-x${o.scale}.min.js`);
    const w = window as Win;
    const modelDef = o.scale === "4" ? w.ESRGANSlim4x : w.ESRGANSlim2x;
    if (!w.Upscaler || !modelDef) throw new Error("upscaler-unavailable");
    const upscaler = new w.Upscaler({ model: { ...modelDef, path: `/codecs/upscaler/models/x${o.scale}/model.json` } });
    const outputs: Output[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const img = await decode(files[i]);
        if (img.width * img.height > MAX_PIXELS[o.scale]) throw new Error("image-too-large");
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d")!.putImageData(img, 0, 0);
        const dataUrl = await upscaler.upscale(canvas, { patchSize: 64, padding: 2, output: "base64", progress: (rate) => onProgress(Math.round(((i + rate) / files.length) * 100), 100) });
        const blob = await (await fetch(dataUrl)).blob();
        const out = await decode(blob);
        const format: Format = o.format === "same" ? (formatOf(files[i].type) ?? "png") : o.format;
        const bytes = await encode(out, format, { quality: 92 });
        outputs.push({ name: `${files[i].name.replace(/\.[^.]+$/, "")}-x${o.scale}.${EXT[format]}`, bytes, mime: MIME[format] });
        onProgress(Math.round(((i + 1) / files.length) * 100), 100);
      }
    } finally {
      await upscaler.dispose().catch(() => {});
    }
    return { ok: true, outputs };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "error", message: /decod|bitmap|source image/i.test(message) ? "undecodable" : message };
  }
}

function Options({ value, onChange }: OptionsProps<O>) {
  const t = useTranslations("options.upscale");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup name="up-scale" value={value.scale} onChange={(scale) => onChange({ ...value, scale })} options={[{ value: "2", label: t("x2"), hint: t("x2Hint") }, { value: "4", label: t("x4"), hint: t("x4Hint") }]} />
      <RadioGroup name="up-format" value={value.format} onChange={(format) => onChange({ ...value, format })} options={[{ value: "same", label: t("same") }, { value: "png", label: "PNG" }, { value: "jpeg", label: "JPG" }]} />
      <span className="text-xs text-ink-2">{t("hint")}</span>
    </div>
  );
}

export const upscaleImage: ToolModule<O> = {
  defaults: { scale: "2", format: "same" },
  Options,
  runOnMain: (files, o, p) => run(files, o as O, p),
  zipName: "upscaled.zip",
};
