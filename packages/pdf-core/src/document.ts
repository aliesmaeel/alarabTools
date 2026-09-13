import { PDFDocument } from "@cantoo/pdf-lib";
import { drawText, embedFont, isRtl, widthOf } from "@alarab/arabic";
import type { RGB } from "./stamp.ts";

export type TextDocumentOptions = {
  text: string;
  fontBytes: Uint8Array;
  size: number;
  color?: RGB;
  align: "start" | "center" | "end";
  /** "fit" makes one page sized to the text. */
  pageSize: "a4" | "a5" | "fit";
  /** Points. */
  margin: number;
};

const SIZES = { a4: [595.28, 841.89], a5: [419.53, 595.28] } as const;

/** Greedy word wrap using shaped widths. */
function wrap(font: Parameters<typeof widthOf>[0], line: string, size: number, maxWidth: number): string[] {
  if (widthOf(font, line, size) <= maxWidth) return [line];
  const words = line.split(/\s+/);
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (widthOf(font, candidate, size) <= maxWidth || !current) current = candidate;
    else {
      out.push(current);
      current = w;
    }
  }
  if (current) out.push(current);
  return out;
}

/** A fresh PDF containing the text, laid out with correct Arabic shaping and direction. */
export async function textDocument(o: TextDocumentOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await embedFont(doc, o.fontBytes);
  const lineHeight = o.size * 1.6;
  const rtl = isRtl(o.text);
  const rawLines = o.text.split(/\r?\n/);

  let pageW: number, pageH: number, lines: string[];
  if (o.pageSize === "fit") {
    lines = rawLines;
    const widest = Math.max(...lines.map((l) => widthOf(font, l, o.size)), o.size);
    pageW = widest + 2 * o.margin;
    pageH = lineHeight * lines.length + 2 * o.margin;
  } else {
    [pageW, pageH] = SIZES[o.pageSize];
    lines = rawLines.flatMap((l) => (l.trim() ? wrap(font, l, o.size, pageW - 2 * o.margin) : [""]));
  }

  const perPage = Math.max(1, Math.floor((pageH - 2 * o.margin) / lineHeight));
  const align = o.align === "center" ? "center" : (o.align === "start") === rtl ? "right" : "left";
  const x = align === "left" ? o.margin : align === "right" ? pageW - o.margin : pageW / 2;

  for (let start = 0; start < lines.length; start += perPage) {
    const page = doc.addPage([pageW, pageH]);
    lines.slice(start, start + perPage).forEach((line, i) => {
      if (!line) return;
      drawText(page, line, { font, size: o.size, x, y: pageH - o.margin - lineHeight * (i + 0.8), align, color: o.color });
    });
  }
  return doc.save({ useObjectStreams: true });
}
