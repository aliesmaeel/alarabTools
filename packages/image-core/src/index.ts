/**
 * Image operations for the browser worker (WASM codecs from jSquash).
 * Everything works on ImageData so tools can be chained: decode -> resize -> encode.
 */

/**
 * The codecs are NOT bundled: Turbopack's production build never finishes on the jSquash
 * emscripten/wasm-bindgen glue. Instead `scripts/copy-assets.mjs` copies the packages to
 * `public/codecs/` and the worker imports them at runtime from there (same-origin, cached
 * independently of the app bundle). The packages stay as dependencies for their types.
 */
let codecBase = "/codecs";
/** Override where the codec files are served from (default `/codecs`). */
export function setCodecBase(base: string) {
  codecBase = base.replace(/\/$/, "");
}
const loaded = new Map<string, Promise<unknown>>();
function codec<T>(path: string): Promise<T> {
  let p = loaded.get(path);
  if (!p) {
    p = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${codecBase}/${path}`);
    loaded.set(path, p);
  }
  return p as Promise<T>;
}
const encodeJpeg = async (...a: Parameters<typeof import("@jsquash/jpeg/encode").default>) => (await codec<typeof import("@jsquash/jpeg/encode")>("jpeg/encode.js")).default(...a);
const encodeWebp = async (...a: Parameters<typeof import("@jsquash/webp/encode").default>) => (await codec<typeof import("@jsquash/webp/encode")>("webp/encode.js")).default(...a);
const encodePng = async (...a: Parameters<typeof import("@jsquash/png/encode").default>) => (await codec<typeof import("@jsquash/png/encode")>("png/encode.js")).default(...a);
const optimisePng = async (...a: Parameters<typeof import("@jsquash/oxipng/optimise").default>) => (await codec<typeof import("@jsquash/oxipng/optimise")>("oxipng/optimise.js")).default(...a);
const resizeImage = async (...a: Parameters<typeof import("@jsquash/resize").default>) => (await codec<typeof import("@jsquash/resize")>("resize/index.js")).default(...a);

export type Format = "jpeg" | "png" | "webp";
export const MIME: Record<Format, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const EXT: Record<Format, string> = { jpeg: "jpg", png: "png", webp: "webp" };

export function formatOf(mime: string): Format | null {
  if (mime === "image/jpeg") return "jpeg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

/** Decode any browser-supported image with EXIF orientation applied. HEIC is not supported by browsers. */
export async function decode(blob: Blob, maxSide = 8192): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h);
}

export type EncodeOptions = {
  /** 1..100 for jpeg/webp. */
  quality?: number;
  /** oxipng level 0..6 for png (2 is a good speed/size balance). */
  pngLevel?: number;
  /** Fill transparent areas with this colour when encoding to JPEG. */
  background?: string;
};

export async function encode(img: ImageData, format: Format, o: EncodeOptions = {}): Promise<Uint8Array> {
  if (format === "jpeg") {
    const flat = flatten(img, o.background ?? "#ffffff");
    return new Uint8Array(await encodeJpeg(flat, { quality: o.quality ?? 80 }));
  }
  if (format === "webp") return new Uint8Array(await encodeWebp(img, { quality: o.quality ?? 80 }));
  const raw = await encodePng(img);
  return new Uint8Array(await optimisePng(raw, { level: o.pngLevel ?? 2, interlace: false }));
}

/** Composite RGBA over a solid colour (JPEG has no alpha). */
export function flatten(img: ImageData, background: string): ImageData {
  const [br, bg, bb] = hex(background);
  const d = img.data;
  let hasAlpha = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { hasAlpha = true; break; }
  if (!hasAlpha) return img;
  const out = new ImageData(new Uint8ClampedArray(d), img.width, img.height);
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    const a = o[i + 3] / 255;
    o[i] = o[i] * a + br * (1 - a);
    o[i + 1] = o[i + 1] * a + bg * (1 - a);
    o[i + 2] = o[i + 2] * a + bb * (1 - a);
    o[i + 3] = 255;
  }
  return out;
}

function hex(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type ResizeSpec =
  | { mode: "percent"; percent: number }
  | { mode: "width"; width: number }
  | { mode: "height"; height: number }
  | { mode: "box"; width: number; height: number };

/** Compute the target size, keeping the aspect ratio. `enlarge: false` never upsizes. */
export function targetSize(w: number, h: number, spec: ResizeSpec, enlarge: boolean): { width: number; height: number } {
  let tw: number, th: number;
  if (spec.mode === "percent") { tw = w * spec.percent / 100; th = h * spec.percent / 100; }
  else if (spec.mode === "width") { tw = spec.width; th = h * spec.width / w; }
  else if (spec.mode === "height") { th = spec.height; tw = w * spec.height / h; }
  else { const s = Math.min(spec.width / w, spec.height / h); tw = w * s; th = h * s; }
  if (!enlarge && (tw > w || th > h)) return { width: w, height: h };
  return { width: Math.max(1, Math.round(tw)), height: Math.max(1, Math.round(th)) };
}

export async function resize(img: ImageData, width: number, height: number): Promise<ImageData> {
  if (width === img.width && height === img.height) return img;
  return resizeImage(img, { width, height, method: "lanczos3", fitMethod: "stretch", premultiply: true, linearRGB: false });
}

/** Rotate by 0/90/180/270 and/or flip. Uses canvas so it is fast on large images. */
export function transform(img: ImageData, rotate: 0 | 90 | 180 | 270, flipH = false, flipV = false): ImageData {
  if (!rotate && !flipH && !flipV) return img;
  const swap = rotate === 90 || rotate === 270;
  const w = swap ? img.height : img.width;
  const h = swap ? img.width : img.height;
  const src = new OffscreenCanvas(img.width, img.height);
  src.getContext("2d")!.putImageData(img, 0, 0);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(src, -img.width / 2, -img.height / 2);
  return ctx.getImageData(0, 0, w, h);
}

export function crop(img: ImageData, x: number, y: number, width: number, height: number): ImageData {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.putImageData(img, 0, 0);
  return ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}
