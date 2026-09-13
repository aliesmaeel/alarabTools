"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

type Pdfjs = typeof import("pdfjs-dist");
let lib: Promise<Pdfjs> | null = null;

/** pdf.js is loaded on demand; its worker file is copied to /public by scripts/copy-assets.mjs. */
export function loadPdfjs(): Promise<Pdfjs> {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return lib;
}

export class PdfPasswordError extends Error {
  name = "PdfPasswordError";
}

export type PdfHandle = { doc: PDFDocumentProxy; close: () => Promise<void> };

/** Open a PDF for rendering. Call `close()` when done to free the worker's memory. */
export async function openPdf(file: File, password?: string): Promise<PdfHandle> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password });
  try {
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (e) {
    if ((e as Error)?.name === "PasswordException") throw new PdfPasswordError();
    throw e;
  }
}

export type RenderOptions = {
  /** Output width in CSS pixels; scale is derived from the page width. */
  width?: number;
  /** Or an explicit scale (1 = 72 dpi). */
  scale?: number;
};

/** Render one page (1-based) to a canvas. The caller owns the canvas. */
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, o: RenderOptions): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = o.scale ?? (o.width ? o.width / base.width : 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality));
}

/** Small JPEG data URL for a thumbnail grid. */
export async function thumbnail(doc: PDFDocumentProxy, pageNumber: number, width = 160): Promise<string> {
  const canvas = await renderPage(doc, pageNumber, { width: width * (window.devicePixelRatio > 1 ? 2 : 1) });
  const url = canvas.toDataURL("image/jpeg", 0.7);
  canvas.width = 0; // release memory
  return url;
}
