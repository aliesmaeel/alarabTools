import { PDFDocument, degrees, type SecurityOptions } from "@cantoo/pdf-lib";
import { parsePageRanges, chunk } from "./pages.ts";

export { parsePageRanges, chunk };

export type Bytes = Uint8Array;
export type Progress = (done: number, total: number) => void;

/** Wrong password or encrypted input where a password was needed. */
export class PdfPasswordError extends Error {
  constructor() {
    super("PDF is password protected");
    this.name = "PdfPasswordError";
  }
}

export async function load(bytes: Bytes, password?: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { password, updateMetadata: false });
  } catch (e) {
    if (String(e).toLowerCase().includes("encrypt") || String(e).toLowerCase().includes("password")) throw new PdfPasswordError();
    throw e;
  }
}

async function save(doc: PDFDocument): Promise<Bytes> {
  return doc.save({ useObjectStreams: true });
}

/** Number of pages, so the UI can offer ranges before running anything. */
export async function pageCount(bytes: Bytes): Promise<number> {
  return (await load(bytes)).getPageCount();
}

/** Merge whole documents in order. */
export async function merge(inputs: Bytes[], onProgress?: Progress): Promise<Bytes> {
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    const src = await load(inputs[i]);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    onProgress?.(i + 1, inputs.length);
  }
  return save(out);
}

/** Build a new document from selected page indices of one source (also used by extract and remove). */
export async function pickPages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  for (const p of pages) out.addPage(p);
  return save(out);
}

export async function removePages(bytes: Bytes, remove: number[]): Promise<Bytes> {
  const src = await load(bytes);
  const drop = new Set(remove);
  const keep = src.getPageIndices().filter((i) => !drop.has(i));
  if (keep.length === 0) throw new Error("Cannot remove every page");
  return pickPages(bytes, keep);
}

export type SplitMode =
  | { mode: "ranges"; ranges: string[] } // each range string becomes one file
  | { mode: "every"; pages: number } // fixed-size chunks
  | { mode: "all" }; // one page per file

export async function split(bytes: Bytes, mode: SplitMode, onProgress?: Progress): Promise<Bytes[]> {
  const src = await load(bytes);
  const n = src.getPageCount();
  let groups: number[][];
  if (mode.mode === "all") groups = chunk(n, 1);
  else if (mode.mode === "every") groups = chunk(n, Math.max(1, mode.pages));
  else groups = mode.ranges.map((r) => parsePageRanges(r, n)).filter((g) => g.length > 0);
  if (groups.length === 0) throw new Error("No pages selected");

  const outputs: Bytes[] = [];
  for (let i = 0; i < groups.length; i++) {
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, groups[i]);
    for (const p of pages) out.addPage(p);
    outputs.push(await save(out));
    onProgress?.(i + 1, groups.length);
  }
  return outputs;
}

/** Rotate by a multiple of 90. `pages` empty or omitted = all pages. Adds to the existing rotation. */
export async function rotate(bytes: Bytes, angle: 90 | 180 | 270 | -90, pages?: number[]): Promise<Bytes> {
  const doc = await load(bytes);
  const targets = pages && pages.length ? pages : doc.getPageIndices();
  for (const i of targets) {
    const page = doc.getPage(i);
    const current = page.getRotation().angle;
    page.setRotation(degrees((((current + angle) % 360) + 360) % 360));
  }
  return save(doc);
}

/** Reorder and rotate in one pass. `order` lists source indices in the new order; `rotations` are absolute per source index. */
export async function organize(bytes: Bytes, order: number[], rotations: Record<number, number> = {}): Promise<Bytes> {
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((p, i) => {
    const r = rotations[order[i]];
    if (r !== undefined) p.setRotation(degrees(((r % 360) + 360) % 360));
    out.addPage(p);
  });
  return save(out);
}

export type CropInsets = { top: number; right: number; bottom: number; left: number }; // in PDF points

/** Shrink the crop box of each page by the given insets (viewers show the crop box). */
export async function crop(bytes: Bytes, insets: CropInsets, pages?: number[]): Promise<Bytes> {
  const doc = await load(bytes);
  const targets = pages && pages.length ? pages : doc.getPageIndices();
  for (const i of targets) {
    const page = doc.getPage(i);
    const { x, y, width, height } = page.getCropBox();
    const w = width - insets.left - insets.right;
    const h = height - insets.top - insets.bottom;
    if (w <= 10 || h <= 10) throw new Error("Crop leaves no page");
    page.setCropBox(x + insets.left, y + insets.bottom, w, h);
  }
  return save(doc);
}

export type Permissions = { printing?: boolean; copying?: boolean; modifying?: boolean; annotating?: boolean };

/** AES-256 encryption. `userPassword` is what readers must type; `ownerPassword` defaults to it. */
export async function protect(bytes: Bytes, userPassword: string, permissions: Permissions = {}, ownerPassword?: string): Promise<Bytes> {
  const doc = await load(bytes);
  const options: SecurityOptions = {
    userPassword,
    ownerPassword: ownerPassword || userPassword,
    permissions: {
      printing: permissions.printing === false ? undefined : "highResolution",
      copying: permissions.copying !== false,
      modifying: permissions.modifying === true,
      annotating: permissions.annotating === true,
      fillingForms: permissions.annotating === true,
      contentAccessibility: true,
      documentAssembly: permissions.modifying === true,
    },
  };
  doc.encrypt(options);
  return save(doc);
}

/** Remove encryption, given the password the user knows. Throws PdfPasswordError if it is wrong. */
export async function unlock(bytes: Bytes, password: string): Promise<Bytes> {
  const src = await load(bytes, password);
  // Copying pages into a fresh document drops the encryption dictionary.
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  for (const p of pages) out.addPage(p);
  return save(out);
}

export async function isEncrypted(bytes: Bytes): Promise<boolean> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return doc.isEncrypted;
}

export type ImageInput = { bytes: Bytes; type: "image/jpeg" | "image/png" };
export type ImagesToPdfOptions = {
  /** "fit": page matches the image size. "a4": A4 portrait/landscape by image orientation. */
  pageSize?: "fit" | "a4";
  /** Margin in points when pageSize is "a4". */
  margin?: number;
};

const A4 = { w: 595.28, h: 841.89 };

/** One image per page. HEIC/WebP must be converted to JPEG/PNG by the caller first. */
export async function imagesToPdf(images: ImageInput[], opts: ImagesToPdfOptions = {}, onProgress?: Progress): Promise<Bytes> {
  const doc = await PDFDocument.create();
  const margin = opts.margin ?? 0;
  for (let i = 0; i < images.length; i++) {
    const { bytes, type } = images[i];
    const img = type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    if (opts.pageSize === "a4") {
      const landscape = img.width > img.height;
      const pw = landscape ? A4.h : A4.w;
      const ph = landscape ? A4.w : A4.h;
      const scale = Math.min((pw - 2 * margin) / img.width, (ph - 2 * margin) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const page = doc.addPage([pw, ph]);
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    } else {
      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    onProgress?.(i + 1, images.length);
  }
  return save(doc);
}
