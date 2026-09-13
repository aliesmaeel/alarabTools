/// <reference lib="webworker" />
import * as Comlink from "comlink";
import * as pdf from "@alarab/pdf-core";
import * as stamp from "@alarab/pdf-core/stamp";
import { textDocument } from "@alarab/pdf-core/document";
import { defaultDigits, formatGregorian, formatHijri, type DigitSystem } from "@alarab/arabic";

import { ensureFontFace, loadFont } from "./fonts";

/** Render text to a transparent PNG with the bundled font, via canvas (the browser shapes Arabic itself). */
async function textToPng(text: string, fontId: string, size: number, color: string, align: string): Promise<Uint8Array> {
  const family = await ensureFontFace(fontId);
  const lines = text.split(/\r?\n/);
  const scale = 2;
  const lh = size * 1.6;
  const pad = size;
  const probe = new OffscreenCanvas(8, 8).getContext("2d")!;
  probe.font = `${size}px "${family}"`;
  const rtl = /[\u0600-\u06FF]/.test(text);
  const width = Math.max(...lines.map((l) => probe.measureText(l).width), size);
  const canvas = new OffscreenCanvas(Math.ceil((width + 2 * pad) * scale), Math.ceil((lh * lines.length + 2 * pad) * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.font = `${size}px "${family}"`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.direction = rtl ? "rtl" : "ltr";
  const x = align === "center" ? width / 2 + pad : (align === "start") === rtl ? width + pad : pad;
  ctx.textAlign = align === "center" ? "center" : (align === "start") === rtl ? "right" : "left";
  lines.forEach((line, i) => ctx.fillText(line, x, pad + i * lh + (lh - size) / 2));
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

function pagesOf(o: Record<string, unknown>, n: number): number[] | undefined {
  return typeof o.pages === "string" && o.pages.trim() ? pdf.parsePageRanges(o.pages, n) : undefined;
}

export type Output = { name: string; bytes: Uint8Array; mime: string };
export type RunResult = { ok: true; outputs: Output[] } | { ok: false; code: "password" | "error"; message: string };
export type ProgressFn = (done: number, total: number) => void;

function base(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

/** Decode any browser-supported image (WebP, GIF, BMP...) to PNG or pass JPEG/PNG through. */
async function toEmbeddable(file: File): Promise<pdf.ImageInput> {
  if (file.type === "image/jpeg" || file.type === "image/png") {
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type };
  }
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "image/png" };
}

type Enhance = "none" | "gray" | "bw";
/** Photo of a document -> cleaned page image. Downscales to 2000px, optional grayscale or black & white. */
async function scanImage(file: File, enhance: Enhance): Promise<pdf.ImageInput> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: enhance !== "none" })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  if (enhance !== "none") {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const gray = new Uint8ClampedArray(w * h);
    let lo = 255, hi = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      gray[j] = g;
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
    // Stretch contrast between the 2nd and 98th percentile-ish bounds.
    const range = Math.max(1, hi - lo);
    if (enhance === "bw") {
      // Adaptive threshold: compare each pixel with the mean of a 32px block (integral image).
      const block = 32;
      const integral = new Float64Array((w + 1) * (h + 1));
      for (let y = 1; y <= h; y++) {
        let row = 0;
        for (let x = 1; x <= w; x++) {
          row += gray[(y - 1) * w + (x - 1)];
          integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
        }
      }
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - block), y1 = Math.min(h, y + block);
        for (let x = 0; x < w; x++) {
          const x0 = Math.max(0, x - block), x1 = Math.min(w, x + block);
          const area = (y1 - y0) * (x1 - x0);
          const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
          const v = gray[y * w + x] < (sum / area) * 0.85 ? 0 : 255;
          const i = (y * w + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
      }
    } else {
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const v = ((gray[j] - lo) / range) * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const type = enhance === "bw" ? "image/png" : "image/jpeg";
  const blob = await canvas.convertToBlob({ type, quality: 0.85 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type };
}

const api = {
  async pageCount(file: File): Promise<number | null> {
    try {
      return await pdf.pageCount(new Uint8Array(await file.arrayBuffer()));
    } catch {
      return null;
    }
  },

  async run(toolId: string, files: File[], options: Record<string, unknown>, onProgress: ProgressFn): Promise<RunResult> {
    try {
      const outputs = await dispatch(toolId, files, options, onProgress);
      return { ok: true, outputs };
    } catch (e) {
      if (e instanceof pdf.PdfPasswordError || (e as Error)?.name === "PdfPasswordError") {
        return { ok: false, code: "password", message: "password" };
      }
      return { ok: false, code: "error", message: e instanceof Error ? e.message : String(e) };
    }
  },
};

async function dispatch(toolId: string, files: File[], o: Record<string, unknown>, onProgress: ProgressFn): Promise<Output[]> {
  const first = files[0];
  const bytesOf = async (f: File) => new Uint8Array(await f.arrayBuffer());
  const PDF = "application/pdf";
  const pw = typeof o.password === "string" ? o.password : undefined;

  switch (toolId) {
    case "merge-pdf": {
      const inputs = await Promise.all(files.map(bytesOf));
      return [{ name: `${base(first.name)}-merged.pdf`, bytes: await pdf.merge(inputs, onProgress), mime: PDF }];
    }
    case "split-pdf": {
      const mode = o.mode as "all" | "every" | "ranges";
      const spec: pdf.SplitMode =
        mode === "all" ? { mode: "all" } : mode === "every" ? { mode: "every", pages: Number(o.every) || 1 } : { mode: "ranges", ranges: String(o.ranges ?? "").split(/[;\n]/).filter(Boolean) };
      const parts = await pdf.split(await bytesOf(first), spec, onProgress);
      return parts.map((bytes, i) => ({ name: `${base(first.name)}-${i + 1}.pdf`, bytes, mime: PDF }));
    }
    case "remove-pages":
    case "extract-pages": {
      const bytes = await bytesOf(first);
      const n = await pdf.pageCount(bytes);
      const indices = pdf.parsePageRanges(String(o.pages ?? ""), n);
      if (indices.length === 0) throw new Error("no-pages");
      const out = toolId === "remove-pages" ? await pdf.removePages(bytes, indices) : await pdf.pickPages(bytes, indices);
      return [{ name: `${base(first.name)}-${toolId === "remove-pages" ? "edited" : "extracted"}.pdf`, bytes: out, mime: PDF }];
    }
    case "rotate-pdf": {
      const angle = Number(o.angle) as 90 | 180 | 270;
      const outs: Output[] = [];
      for (let i = 0; i < files.length; i++) {
        const bytes = await bytesOf(files[i]);
        const pages = o.pages ? pdf.parsePageRanges(String(o.pages), await pdf.pageCount(bytes)) : undefined;
        outs.push({ name: `${base(files[i].name)}-rotated.pdf`, bytes: await pdf.rotate(bytes, angle, pages), mime: PDF });
        onProgress(i + 1, files.length);
      }
      return outs;
    }
    case "crop-pdf": {
      const mm = 72 / 25.4;
      const insets = { top: Number(o.top) * mm || 0, right: Number(o.right) * mm || 0, bottom: Number(o.bottom) * mm || 0, left: Number(o.left) * mm || 0 };
      return [{ name: `${base(first.name)}-cropped.pdf`, bytes: await pdf.crop(await bytesOf(first), insets), mime: PDF }];
    }
    case "protect-pdf": {
      const outs: Output[] = [];
      for (let i = 0; i < files.length; i++) {
        const bytes = await pdf.protect(await bytesOf(files[i]), String(o.password), {
          printing: o.allowPrint !== false,
          copying: o.allowCopy !== false,
          modifying: o.allowModify === true,
        });
        outs.push({ name: `${base(files[i].name)}-protected.pdf`, bytes, mime: PDF });
        onProgress(i + 1, files.length);
      }
      return outs;
    }
    case "unlock-pdf": {
      const outs: Output[] = [];
      for (let i = 0; i < files.length; i++) {
        outs.push({ name: `${base(files[i].name)}-unlocked.pdf`, bytes: await pdf.unlock(await bytesOf(files[i]), pw ?? ""), mime: PDF });
        onProgress(i + 1, files.length);
      }
      return outs;
    }
    case "jpg-to-pdf": {
      const images: pdf.ImageInput[] = [];
      for (let i = 0; i < files.length; i++) {
        images.push(await toEmbeddable(files[i]));
        onProgress(i, files.length + 1);
      }
      const bytes = await pdf.imagesToPdf(images, { pageSize: o.pageSize === "a4" ? "a4" : "fit", margin: o.margin ? 28 : 0 });
      onProgress(files.length + 1, files.length + 1);
      return [{ name: `${files.length === 1 ? base(first.name) : "images"}.pdf`, bytes, mime: PDF }];
    }
    case "add-page-numbers": {
      const bytes = await bytesOf(first);
      const style = { fontBytes: await loadFont(String(o.font)), size: Number(o.size) || 12, color: stamp.hexToRgb(String(o.color)) };
      const digits = (o.digits || defaultDigits(String(o.locale ?? "ar"))) as DigitSystem;
      const out = await stamp.addPageNumbers(bytes, {
        style, digits, position: o.position as Exclude<stamp.Position, "center">, margin: Number(o.margin) || 0, start: Number(o.start) || 1,
        template: String(o.template || "{n}"), pages: pagesOf(o, await pdf.pageCount(bytes)),
      });
      return [{ name: `${base(first.name)}-numbered.pdf`, bytes: out, mime: PDF }];
    }
    case "add-watermark": {
      const layout = String(o.layout);
      const opacity = (Number(o.opacity) || 25) / 100;
      const position = layout === "corner" ? (o.position as stamp.Position) : "center";
      const isImage = o.kind === "image" && o.image instanceof File;
      const image = isImage ? await toEmbeddable(o.image as File) : null;
      const style = isImage ? null : { fontBytes: await loadFont(String(o.font)), size: Number(o.size) || 48, color: stamp.hexToRgb(String(o.color)), opacity };
      const outs: Output[] = [];
      for (let i = 0; i < files.length; i++) {
        const bytes = await bytesOf(files[i]);
        const pages = pagesOf(o, await pdf.pageCount(bytes));
        const out = image
          ? await stamp.stampImage(bytes, { image, position, margin: 24, widthRatio: Math.min(1, Math.max(0.05, (Number(o.widthPercent) || 30) / 100)), opacity, tile: layout === "tile", pages })
          : await stamp.stampText(bytes, { text: String(o.text), style: style!, tile: layout === "tile", rotate: layout === "corner" ? 0 : Number(o.rotate) || 0, position, margin: 24, pages });
        outs.push({ name: `${base(files[i].name)}-watermarked.pdf`, bytes: out, mime: PDF });
        onProgress(i + 1, files.length);
      }
      return outs;
    }
    case "hijri-date-stamp": {
      const locale = String(o.locale ?? "ar") as "ar" | "en";
      const digits = (o.digits || defaultDigits(locale)) as DigitSystem;
      const date = new Date(`${o.date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) throw new Error("bad-date");
      const dateStyle = o.dateStyle === "numeric" ? "numeric" : "long";
      const lines: string[] = [];
      if (o.calendars !== "gregorian") lines.push(formatHijri(date, locale, dateStyle, digits));
      if (o.calendars !== "hijri") lines.push(formatGregorian(date, locale, dateStyle, digits));
      const prefix = String(o.prefix ?? "").trim();
      const text = (prefix ? [prefix, ...lines] : lines).join("\n");
      const style = { fontBytes: await loadFont(String(o.font)), size: Number(o.size) || 14, color: stamp.hexToRgb(String(o.color)), opacity: (Number(o.opacity) || 100) / 100 };
      const outs: Output[] = [];
      for (let i = 0; i < files.length; i++) {
        const bytes = await bytesOf(files[i]);
        const out = await stamp.stampText(bytes, { text, style, position: o.position as stamp.Position, margin: Number(o.margin) || 0, pages: pagesOf(o, await pdf.pageCount(bytes)) });
        outs.push({ name: `${base(files[i].name)}-dated.pdf`, bytes: out, mime: PDF });
        onProgress(i + 1, files.length);
      }
      return outs;
    }
    case "organize-pdf": {
      const pages = (o.pages as { index: number; rotation: number; removed: boolean }[]) ?? [];
      const kept = pages.filter((p) => !p.removed);
      if (kept.length === 0) throw new Error("no-pages");
      const rotations: Record<number, number> = {};
      for (const p of kept) if (p.rotation) rotations[p.index] = p.rotation;
      return [{ name: `${base(first.name)}-organized.pdf`, bytes: await pdf.organize(await bytesOf(first), kept.map((p) => p.index), rotations), mime: PDF }];
    }
    case "scan-to-pdf": {
      const images: pdf.ImageInput[] = [];
      for (let i = 0; i < files.length; i++) {
        images.push(await scanImage(files[i], (o.enhance as Enhance) ?? "gray"));
        onProgress(i + 1, files.length + 1);
      }
      const bytes = await pdf.imagesToPdf(images, { pageSize: o.pageSize === "fit" ? "fit" : "a4", margin: 0 });
      onProgress(files.length + 1, files.length + 1);
      return [{ name: "scan.pdf", bytes, mime: PDF }];
    }
    case "sign-pdf": {
      const sig = o.sig as Uint8Array | null;
      if (!sig) throw new Error("no-signature");
      const bytes = await bytesOf(first);
      const n = await pdf.pageCount(bytes);
      const pages = o.allPages ? Array.from({ length: n }, (_, i) => i) : [Math.min(Number(o.page) || 0, n - 1)];
      const placements = pages.map((page) => ({ page, x: Number(o.x) || 0, y: Number(o.y) || 0, w: Number(o.w) || 0.3 }));
      return [{ name: `${base(first.name)}-signed.pdf`, bytes: await stamp.placeImages(bytes, { bytes: sig, type: "image/png" }, placements), mime: PDF }];
    }
    case "arabic-fonts": {
      const text = String(o.text ?? "");
      const align = String(o.align ?? "start");
      if (o.format === "png") {
        return [{ name: "arabic-text.png", bytes: await textToPng(text, String(o.font), Number(o.size) || 36, String(o.color), align), mime: "image/png" }];
      }
      const bytes = await textDocument({
        text, fontBytes: await loadFont(String(o.font)), size: Number(o.size) || 36, color: stamp.hexToRgb(String(o.color)),
        align: align as "start" | "center" | "end", pageSize: (o.pageSize as "a4" | "a5" | "fit") ?? "fit", margin: o.pageSize === "fit" ? 24 : 56,
      });
      return [{ name: "arabic-text.pdf", bytes, mime: PDF }];
    }
    default:
      throw new Error(`Tool ${toolId} is not implemented`);
  }
}

export type PdfWorkerApi = typeof api;
Comlink.expose(api);
