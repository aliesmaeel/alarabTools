import { PDFDocument, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import { drawText, embedFont, formatDigits, widthOf, type DigitSystem } from "@alarab/arabic";
import { load } from "./index.ts";

export type Position = "top-left" | "top-center" | "top-right" | "center" | "bottom-left" | "bottom-center" | "bottom-right";
export type RGB = { r: number; g: number; b: number };

export type TextStyle = {
  fontBytes: Uint8Array;
  size: number;
  color?: RGB;
  opacity?: number;
};

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** Anchor point and alignment for a position on a page of the given size. */
function anchor(pos: Position, width: number, height: number, margin: number, lineHeight: number, lines: number) {
  const [v, h] = pos === "center" ? ["center", "center"] : pos.split("-");
  const x = h === "left" ? margin : h === "right" ? width - margin : width / 2;
  const block = lineHeight * lines;
  // y is the baseline of the FIRST line; lines go downward.
  const y = v === "top" ? height - margin - lineHeight * 0.8 : v === "bottom" ? margin + block - lineHeight * 0.8 : height / 2 + block / 2 - lineHeight * 0.8;
  return { x, y, align: h as "left" | "center" | "right" };
}

function drawLines(page: PDFPage, lines: string[], font: PDFFont, style: TextStyle, pos: Position, margin: number, rotate = 0) {
  const lineHeight = style.size * 1.4;
  const { width, height } = page.getSize();
  const a = anchor(pos, width, height, margin, lineHeight, lines.length);
  lines.forEach((line, i) => {
    drawText(page, line, { font, size: style.size, x: a.x, y: a.y - i * lineHeight, align: a.align, color: style.color, opacity: style.opacity, rotate });
  });
}

export type PageNumberOptions = {
  style: TextStyle;
  position: Exclude<Position, "center">;
  /** Distance from the page edge, in points. */
  margin: number;
  /** Number given to the first numbered page. */
  start: number;
  /** "{n}" and "{total}" are replaced. e.g. "{n} / {total}" or "صفحة {n} من {total}". */
  template: string;
  digits: DigitSystem;
  /** 0-based indices to number; default all. */
  pages?: number[];
};

export async function addPageNumbers(bytes: Uint8Array, o: PageNumberOptions): Promise<Uint8Array> {
  const doc = await load(bytes);
  const font = await embedFont(doc, o.style.fontBytes);
  const targets = o.pages && o.pages.length ? o.pages : doc.getPageIndices();
  const total = formatDigits(o.start + targets.length - 1, o.digits);
  targets.forEach((idx, i) => {
    const text = o.template.replace(/\{n\}/g, formatDigits(o.start + i, o.digits)).replace(/\{total\}/g, total);
    drawLines(doc.getPage(idx), [text], font, o.style, o.position, o.margin);
  });
  return doc.save({ useObjectStreams: true });
}

export type StampOptions = {
  /** Lines of text ("\n" separated). */
  text: string;
  style: TextStyle;
  position: Position;
  margin: number;
  /** Degrees counter-clockwise. */
  rotate?: number;
  /** Repeat the text in a grid across the page (position is ignored). */
  tile?: boolean;
  pages?: number[];
};

/** Text watermark or stamp (also used for the Hijri date stamp). */
export async function stampText(bytes: Uint8Array, o: StampOptions): Promise<Uint8Array> {
  const doc = await load(bytes);
  const font = await embedFont(doc, o.style.fontBytes);
  const targets = o.pages && o.pages.length ? o.pages : doc.getPageIndices();
  const lines = o.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("empty-text");
  for (const idx of targets) {
    const page = doc.getPage(idx);
    if (o.tile) {
      const { width, height } = page.getSize();
      const textW = Math.max(...lines.map((l) => widthOf(font, l, o.style.size)));
      const stepX = textW + o.style.size * 3;
      const stepY = o.style.size * 6;
      for (let y = -height * 0.2; y < height * 1.2; y += stepY) {
        for (let x = -width * 0.2; x < width * 1.2; x += stepX) {
          lines.forEach((line, i) => drawText(page, line, { font, size: o.style.size, x, y: y - i * o.style.size * 1.4, color: o.style.color, opacity: o.style.opacity, rotate: o.rotate ?? 45 }));
        }
      }
    } else {
      drawLines(page, lines, font, o.style, o.position, o.margin, o.rotate ?? 0);
    }
  }
  return doc.save({ useObjectStreams: true });
}

export type ImageStampOptions = {
  image: { bytes: Uint8Array; type: "image/jpeg" | "image/png" };
  position: Position;
  margin: number;
  /** Image width as a fraction of page width (0..1). */
  widthRatio: number;
  opacity?: number;
  rotate?: number;
  tile?: boolean;
  pages?: number[];
};

export async function stampImage(bytes: Uint8Array, o: ImageStampOptions): Promise<Uint8Array> {
  const doc = await load(bytes);
  const img = o.image.type === "image/png" ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes);
  const targets = o.pages && o.pages.length ? o.pages : doc.getPageIndices();
  for (const idx of targets) {
    const page = doc.getPage(idx);
    const { width, height } = page.getSize();
    const w = width * o.widthRatio;
    const h = (img.height / img.width) * w;
    const place = (x: number, y: number) => page.drawImage(img, { x, y, width: w, height: h, opacity: o.opacity, rotate: o.rotate ? { type: "degrees", angle: o.rotate } as never : undefined });
    if (o.tile) {
      for (let y = -h; y < height + h; y += h * 2) for (let x = -w; x < width + w; x += w * 2) place(x, y);
    } else {
      const [v, hz] = o.position === "center" ? ["center", "center"] : o.position.split("-");
      const x = hz === "left" ? o.margin : hz === "right" ? width - o.margin - w : (width - w) / 2;
      const y = v === "top" ? height - o.margin - h : v === "bottom" ? o.margin : (height - h) / 2;
      place(x, y);
    }
  }
  return doc.save({ useObjectStreams: true });
}

export { PDFDocument };

export type Placement = {
  /** 0-based page index. */
  page: number;
  /** Position of the image's top-left corner as fractions of the DISPLAYED page (0..1, y downward). */
  x: number;
  y: number;
  /** Image width as a fraction of the displayed page width. */
  w: number;
};

/**
 * Draw one image at absolute positions chosen on a preview. Coordinates are in display space
 * (what pdf.js renders, i.e. after the page's /Rotate), so they are mapped back to PDF space.
 */
export async function placeImages(bytes: Uint8Array, image: ImageStampOptions["image"], placements: Placement[]): Promise<Uint8Array> {
  const doc = await load(bytes);
  const img = image.type === "image/png" ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes);
  const ratio = img.height / img.width;
  for (const p of placements) {
    const page = doc.getPage(p.page);
    const { width: W, height: H } = page.getSize();
    const r = ((page.getRotation().angle % 360) + 360) % 360;
    const rotated = r === 90 || r === 270;
    const dW = rotated ? H : W; // displayed size
    const dH = rotated ? W : H;
    const dw = p.w * dW;
    const dh = dw * ratio;
    // Display-space bottom-left corner of the image (top-left origin, y down).
    const dx = p.x * dW;
    const dy = p.y * dH + dh;
    // Map to PDF space (bottom-left origin) and rotate the image with the page.
    let x: number, y: number;
    if (r === 90) [x, y] = [dy, dx];
    else if (r === 180) [x, y] = [W - dx, dy];
    else if (r === 270) [x, y] = [W - dy, H - dx];
    else [x, y] = [dx, H - dy];
    page.drawImage(img, { x, y, width: dw, height: dh, rotate: { type: "degrees", angle: r } as never });
  }
  return doc.save({ useObjectStreams: true });
}
