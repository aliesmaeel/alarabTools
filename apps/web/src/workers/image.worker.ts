/// <reference lib="webworker" />
import * as Comlink from "comlink";
import * as img from "@alarab/image-core";
import type { Output, RunResult, ProgressFn } from "./pdf.worker";

function base(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

const QUALITY: Record<string, number> = { high: 85, recommended: 75, extreme: 55 };

async function processOne(toolId: string, file: File, o: Record<string, unknown>): Promise<Output> {
  const source = await img.decode(file);
  const srcFormat = img.formatOf(file.type);

  switch (toolId) {
    case "compress-image": {
      const format: img.Format = srcFormat ?? "jpeg";
      const quality = QUALITY[String(o.level)] ?? 75;
      const bytes = await img.encode(source, format, { quality, pngLevel: o.level === "extreme" ? 4 : 2 });
      return { name: `${base(file.name)}-compressed.${img.EXT[format]}`, bytes, mime: img.MIME[format] };
    }
    case "resize-image": {
      const spec = o.spec as img.ResizeSpec;
      const { width, height } = img.targetSize(source.width, source.height, spec, o.enlarge === true);
      const resized = await img.resize(source, width, height);
      const format: img.Format = srcFormat ?? "png";
      const bytes = await img.encode(resized, format, { quality: 88 });
      return { name: `${base(file.name)}-${width}x${height}.${img.EXT[format]}`, bytes, mime: img.MIME[format] };
    }
    case "convert-to-jpg": {
      const bytes = await img.encode(source, "jpeg", { quality: Number(o.quality) || 88, background: String(o.background ?? "#ffffff") });
      return { name: `${base(file.name)}.jpg`, bytes, mime: "image/jpeg" };
    }
    case "convert-from-jpg": {
      const format: img.Format = o.format === "webp" ? "webp" : "png";
      const bytes = await img.encode(source, format, { quality: Number(o.quality) || 88 });
      return { name: `${base(file.name)}.${img.EXT[format]}`, bytes, mime: img.MIME[format] };
    }
    case "rotate-image": {
      const rotated = img.transform(source, (Number(o.angle) || 0) as 0 | 90 | 180 | 270, o.flipH === true, o.flipV === true);
      const format: img.Format = srcFormat ?? "png";
      const bytes = await img.encode(rotated, format, { quality: 92 });
      return { name: `${base(file.name)}-rotated.${img.EXT[format]}`, bytes, mime: img.MIME[format] };
    }
    case "crop-image": {
      const r = o.rect as { x: number; y: number; w: number; h: number }; // fractions
      const cropped = img.crop(source, r.x * source.width, r.y * source.height, r.w * source.width, r.h * source.height);
      const format: img.Format = srcFormat ?? "png";
      const bytes = await img.encode(cropped, format, { quality: 92 });
      return { name: `${base(file.name)}-cropped.${img.EXT[format]}`, bytes, mime: img.MIME[format] };
    }
    default:
      throw new Error(`Tool ${toolId} is not implemented`);
  }
}

const api = {
  async run(toolId: string, files: File[], options: Record<string, unknown>, onProgress: ProgressFn): Promise<RunResult> {
    try {
      const outputs: Output[] = [];
      for (let i = 0; i < files.length; i++) {
        outputs.push(await processOne(toolId, files[i], options));
        onProgress(i + 1, files.length);
      }
      return { ok: true, outputs };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // createImageBitmap rejects HEIC and corrupt files with a DOMException.
      return { ok: false, code: "error", message: /decod|bitmap|source image/i.test(message) ? "undecodable" : message };
    }
  },
};

export type ImageWorkerApi = typeof api;
Comlink.expose(api);
