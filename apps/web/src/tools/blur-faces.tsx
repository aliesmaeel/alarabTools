"use client";

import { useTranslations } from "next-intl";
import type { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import { decode, encode, formatOf, EXT, MIME, type Format } from "@alarab/image-core";
import type { OptionsProps, ToolModule } from "./types";
import type { Output, RunResult } from "@/workers/pdf.worker";
import { Field, RadioGroup, TextInput } from "./fields";

type O = { mode: "blur" | "pixelate"; strength: "light" | "medium" | "strong"; padding: number };
type Box = { x: number; y: number; w: number; h: number };

/**
 * MediaPipe's loader needs a document (or classic importScripts), so detection runs on the main
 * thread. The runtime is served from /codecs/mediapipe (see scripts/copy-assets.mjs) and the
 * BlazeFace short-range model from /models; both load on first use only.
 */
type Vision = { FaceDetector: typeof FaceDetector; FilesetResolver: typeof FilesetResolver };
let detectorPromise: Promise<FaceDetector> | null = null;
function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const url: string = "/codecs/mediapipe/vision_bundle.mjs";
      const vision: Vision = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
      const fileset = await vision.FilesetResolver.forVisionTasks("/codecs/mediapipe/wasm");
      return vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/models/blaze_face_short_range.tflite", delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
      });
    })().catch((e) => { detectorPromise = null; throw e; });
  }
  return detectorPromise;
}

const DETECT_MAX_SIDE = 1536;

async function findFaces(img: ImageData): Promise<Box[]> {
  const detector = await getDetector();
  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(img.width, img.height));
  const bitmap = await createImageBitmap(img, scale < 1 ? { resizeWidth: Math.round(img.width * scale), resizeHeight: Math.round(img.height * scale), resizeQuality: "high" } : {});
  try {
    const { detections } = detector.detect(bitmap);
    return detections.flatMap((d) => (d.boundingBox ? [{ x: d.boundingBox.originX / scale, y: d.boundingBox.originY / scale, w: d.boundingBox.width / scale, h: d.boundingBox.height / scale }] : []));
  } finally {
    bitmap.close();
  }
}

const BLUR: Record<O["strength"], number> = { light: 0.05, medium: 0.1, strong: 0.18 };
const CELLS: Record<O["strength"], number> = { light: 14, medium: 9, strong: 6 };

/** Obscure each box (grown by `padding` %) with an elliptical blur or pixelation. */
function obscure(img: ImageData, boxes: Box[], o: O): ImageData {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.putImageData(img, 0, 0);
  const canFilter = "filter" in ctx;
  for (const b of boxes) {
    const grow = (o.padding / 100) * Math.max(b.w, b.h);
    const x = Math.max(0, Math.floor(b.x - grow)), y = Math.max(0, Math.floor(b.y - grow));
    const w = Math.min(img.width - x, Math.ceil(b.w + 2 * grow)), h = Math.min(img.height - y, Math.ceil(b.h + 2 * grow));
    if (w < 2 || h < 2) continue;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    if (o.mode === "blur" && canFilter) {
      // Blur a padded copy so the edges of the ellipse don't fade to transparent.
      const r = Math.max(3, Math.round(Math.max(w, h) * BLUR[o.strength]));
      const px = Math.max(0, x - 2 * r), py = Math.max(0, y - 2 * r);
      const pw = Math.min(img.width - px, w + 4 * r), ph = Math.min(img.height - py, h + 4 * r);
      const tmp = new OffscreenCanvas(pw, ph);
      const tctx = tmp.getContext("2d")!;
      tctx.filter = `blur(${r}px)`;
      tctx.drawImage(canvas, px, py, pw, ph, 0, 0, pw, ph);
      ctx.drawImage(tmp, px, py);
    } else {
      const cells = CELLS[o.strength];
      const sw = Math.max(1, Math.round(cells)), sh = Math.max(1, Math.round((cells * h) / w));
      const small = new OffscreenCanvas(sw, sh);
      small.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
    }
    ctx.restore();
  }
  return ctx.getImageData(0, 0, img.width, img.height);
}

async function run(files: File[], o: O, onProgress: (done: number, total: number) => void): Promise<RunResult> {
  try {
    const outputs: Output[] = [];
    let faces = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const img = await decode(file);
      const boxes = await findFaces(img);
      faces += boxes.length;
      const out = boxes.length ? obscure(img, boxes, o) : img;
      const format: Format = formatOf(file.type) ?? "jpeg";
      const bytes = await encode(out, format, { quality: 92 });
      outputs.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-blurred.${EXT[format]}`, bytes, mime: MIME[format] });
      onProgress(i + 1, files.length);
    }
    return { ok: true, outputs, note: { key: "blurFaces.found", count: faces } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "error", message: /decod|bitmap|source image/i.test(message) ? "undecodable" : message };
  }
}

function Options({ value, onChange }: OptionsProps<O>) {
  const t = useTranslations("options.blurFaces");
  const set = (patch: Partial<O>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup name="bf-mode" value={value.mode} onChange={(mode) => set({ mode })} options={[{ value: "blur", label: t("blur") }, { value: "pixelate", label: t("pixelate") }]} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("strength")}</span>
        <RadioGroup name="bf-strength" value={value.strength} onChange={(strength) => set({ strength })} options={[{ value: "light", label: t("light") }, { value: "medium", label: t("medium") }, { value: "strong", label: t("strong") }]} />
      </div>
      <Field label={t("padding")} hint={t("hint")}>
        {(id) => <TextInput id={id} type="number" min={0} max={50} step={5} value={value.padding} onChange={(e) => set({ padding: Number(e.target.value) })} />}
      </Field>
    </div>
  );
}

export const blurFaces: ToolModule<O> = {
  defaults: { mode: "blur", strength: "medium", padding: 15 },
  Options,
  runOnMain: (files, o, p) => run(files, o as O, p),
  zipName: "blurred.zip",
};
