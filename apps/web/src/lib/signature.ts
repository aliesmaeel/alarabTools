"use client";

import { fontInfo } from "@alarab/arabic";

export type SignatureImage = { bytes: Uint8Array; url: string; width: number; height: number };

/** Crop transparent margins and export as PNG. */
export async function trimAndExport(canvas: HTMLCanvasElement, pad = 8): Promise<SignatureImage | null> {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1 + pad * 2;
  out.height = maxY - minY + 1 + pad * 2;
  out.getContext("2d")!.drawImage(canvas, minX, minY, maxX - minX + 1, maxY - minY + 1, pad, pad, maxX - minX + 1, maxY - minY + 1);
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), width: out.width, height: out.height };
}

const loaded = new Set<string>();
/** Load a bundled font into the document so canvas text can use it. */
export async function ensureFont(fontId: string): Promise<string> {
  const family = `alarab-${fontId}`;
  if (!loaded.has(family)) {
    const face = new FontFace(family, `url(/fonts/${encodeURIComponent(fontInfo(fontId).file)})`);
    await face.load();
    document.fonts.add(face);
    loaded.add(family);
  }
  return family;
}

/** Render typed text as a transparent PNG with the given bundled font. */
export async function typedSignature(text: string, fontId: string, color = "#161b2f"): Promise<SignatureImage | null> {
  if (!text.trim()) return null;
  const family = await ensureFont(fontId);
  const size = 72;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `${size}px "${family}"`;
  const w = Math.ceil(probe.measureText(text).width) + size;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = size * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${size}px "${family}"`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.direction = /[؀-ۿ]/.test(text) ? "rtl" : "ltr";
  ctx.fillText(text, w / 2, size);
  return trimAndExport(canvas);
}

/** Decode an uploaded image (PNG keeps transparency; JPEG stays opaque). */
export async function uploadedSignature(file: File): Promise<SignatureImage | null> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1200 / bitmap.width);
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return trimAndExport(canvas, 0);
}
