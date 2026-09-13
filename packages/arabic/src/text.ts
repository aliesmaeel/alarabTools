import bidiFactory from "bidi-js";
import fontkit from "@cantoo/fontkit";
import { rgb, degrees, type PDFDocument, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";

const bidi = bidiFactory();

export type Run = { text: string; rtl: boolean };

/**
 * Split mixed-direction text into runs in VISUAL order (left to right on the page).
 * Each RTL run keeps its LOGICAL character order: fontkit's Arabic shaper (used by pdf-lib)
 * joins the letters and reverses the glyphs itself, so the run is passed to it as typed.
 */
export function visualRuns(text: string, base: "ltr" | "rtl" | "auto" = "auto"): Run[] {
  if (!text) return [];
  const levels = bidi.getEmbeddingLevels(text, base);
  const order = bidi.getReorderedIndices(text, levels);
  const mirrored = bidi.getMirroredCharactersMap(text, levels.levels);
  const runs: { chars: string[]; indices: number[]; rtl: boolean }[] = [];
  for (const i of order) {
    const rtl = levels.levels[i] % 2 === 1;
    const ch = mirrored.get(i) ?? text[i];
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) {
      last.chars.push(ch);
      last.indices.push(i);
    } else runs.push({ chars: [ch], indices: [i], rtl });
  }
  return runs.map((r) => ({
    // Visual order for RTL runs is the reverse of logical order; undo it for the shaper.
    text: r.rtl ? r.chars.reverse().join("") : r.chars.join(""),
    rtl: r.rtl,
  }));
}

/** Detect whether text is mostly right-to-left (for choosing the default alignment). */
export function isRtl(text: string): boolean {
  const levels = bidi.getEmbeddingLevels(text, "auto");
  return levels.paragraphs[0]?.level === 1;
}

export function widthOf(font: PDFFont, text: string, size: number): number {
  return visualRuns(text).reduce((w, r) => w + font.widthOfTextAtSize(r.text, size), 0);
}

export type DrawOptions = {
  font: PDFFont;
  size: number;
  /** Anchor point. With align "left" the text starts at x; "center" is centred on x; "right" ends at x. */
  x: number;
  y: number;
  align?: "left" | "center" | "right";
  color?: { r: number; g: number; b: number }; // 0..1
  opacity?: number;
  /** Degrees, counter-clockwise, around the anchor. */
  rotate?: number;
};

/** Draw a line of Arabic/Latin text with correct joining and direction. Returns the drawn width. */
export function drawText(page: PDFPage, text: string, o: DrawOptions): number {
  const runs = visualRuns(text);
  const widths = runs.map((r) => o.font.widthOfTextAtSize(r.text, o.size));
  const total = widths.reduce((a, b) => a + b, 0);
  const align = o.align ?? "left";
  const startX = align === "left" ? o.x : align === "center" ? o.x - total / 2 : o.x - total;
  const rad = ((o.rotate ?? 0) * Math.PI) / 180;
  const color = o.color ? rgb(o.color.r, o.color.g, o.color.b) : rgb(0, 0, 0);

  let cursor = 0;
  runs.forEach((run, i) => {
    // Offset along the (possibly rotated) baseline from the anchor.
    const dx = startX - o.x + cursor;
    page.drawText(run.text, {
      x: o.x + dx * Math.cos(rad),
      y: o.y + dx * Math.sin(rad),
      size: o.size,
      font: o.font,
      color,
      opacity: o.opacity,
      rotate: degrees(o.rotate ?? 0),
    });
    cursor += widths[i];
  });
  return total;
}

/** Embed a bundled font. Subsetting keeps output small; fontkit must be registered once per document. */
export async function embedFont(doc: PDFDocument, bytes: Uint8Array): Promise<PDFFont> {
  doc.registerFontkit(fontkit as unknown as Parameters<PDFDocument["registerFontkit"]>[0]);
  return doc.embedFont(bytes, { subset: true });
}
