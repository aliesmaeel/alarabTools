/// <reference lib="webworker" />
import { fontInfo } from "@alarab/arabic";

const fontCache = new Map<string, Promise<Uint8Array>>();
/** Bundled fonts are served from /fonts; fetched once per worker. */
export function loadFont(id: string): Promise<Uint8Array> {
  const file = fontInfo(id).file;
  let p = fontCache.get(file);
  if (!p) {
    p = fetch(new URL(`/fonts/${encodeURIComponent(file)}`, self.location.origin)).then(async (r) => {
      if (!r.ok) throw new Error(`font ${file}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    fontCache.set(file, p);
  }
  return p;
}

const faceCache = new Map<string, Promise<string>>();
/**
 * Register a bundled font with the worker's FontFaceSet so canvas can draw with it
 * (the browser shapes Arabic itself). Resolves to the CSS family name.
 * Throws "png-unsupported" where workers have no FontFaceSet.
 */
export function ensureFontFace(fontId: string): Promise<string> {
  const fonts = (self as unknown as { fonts?: FontFaceSet }).fonts;
  if (!fonts) throw new Error("png-unsupported");
  const family = `alarab-${fontId}`;
  let p = faceCache.get(family);
  if (!p) {
    p = (async () => {
      if (![...fonts].some((f) => f.family === family)) {
        const bytes = await loadFont(fontId);
        const face = new FontFace(family, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        await face.load();
        fonts.add(face);
      }
      return family;
    })();
    faceCache.set(family, p);
  }
  return p;
}
