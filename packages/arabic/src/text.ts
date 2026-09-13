import bidiFactory from "bidi-js";
import fontkit from "@cantoo/fontkit";
import { rgb, degrees, type PDFDocument, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";

const bidi = bidiFactory();

export type Run = { text: string; rtl: boolean };

/**
 * Code points fontkit's script detection files under "Arabic" even though bidi treats them as
 * numbers or neutrals: Arabic-Indic digits, the Arabic percent/decimal/thousands signs and so on.
 * (U+060C, U+061B, U+061F and U+0640 are "Common" in both.)
 */
const ARABIC_BLOCK = /[\u0600-\u060B\u060D-\u061A\u061C-\u061E\u0620-\u063F\u0641-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Split mixed-direction text into runs in VISUAL order (left to right on the page), each holding
 * the characters in the order the shaper must RECEIVE them. fontkit (used by pdf-lib) joins the
 * letters and reverses the glyphs of any run whose first strong script is Arabic, so:
 * - RTL runs keep their logical order (fontkit reverses them into visual order);
 * - LTR runs are split into Arabic-block and other segments, and the Arabic-block ones (e.g.
 *   Arabic-Indic digits "١٤٤٨", which bidi lays out left to right) are pre-reversed so that
 *   fontkit's reversal puts them back in reading order.
 */
export function visualRuns(text: string, base: "ltr" | "rtl" | "auto" = "auto"): Run[] {
  if (!text) return [];
  const levels = bidi.getEmbeddingLevels(text, base);
  const order = bidi.getReorderedIndices(text, levels);
  const mirrored = bidi.getMirroredCharactersMap(text, levels.levels);
  const runs: { chars: string[]; rtl: boolean }[] = [];
  for (const i of order) {
    const rtl = levels.levels[i] % 2 === 1;
    const ch = mirrored.get(i) ?? text[i];
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.chars.push(ch);
    else runs.push({ chars: [ch], rtl });
  }
  const out: Run[] = [];
  for (const r of runs) {
    if (r.rtl) {
      // Visual order for RTL runs is the reverse of logical order; undo it for the shaper.
      out.push({ text: r.chars.reverse().join(""), rtl: true });
      continue;
    }
    let seg: string[] = [], segArabic: boolean | null = null;
    const flush = () => { if (seg.length) out.push({ text: segArabic ? seg.reverse().join("") : seg.join(""), rtl: false }); seg = []; };
    for (const ch of r.chars) {
      const arabic = ARABIC_BLOCK.test(ch);
      if (segArabic !== null && arabic !== segArabic) flush();
      segArabic = arabic;
      seg.push(ch);
    }
    flush();
  }
  return out;
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
