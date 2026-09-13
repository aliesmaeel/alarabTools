/**
 * Flatten "Edit PDF" elements onto pages. Every element is positioned in the DISPLAYED page
 * (as pdf.js renders it, after /Rotate) using fractions of its width and height, so the browser
 * preview and this output agree. Sizes (text, stroke) are fractions of the displayed width.
 */
import { BlendMode, LineCapStyle, PDFPage, degrees, rgb, type PDFFont } from "@cantoo/pdf-lib";
import { drawText, embedFont } from "@alarab/arabic";
import { load, type Bytes } from "./index";
import { hexToRgb } from "./stamp";

type Base = { id?: string; page: number; x: number; y: number; w: number; h: number };
export type Edit =
  | (Base & { kind: "text"; text: string; font: string; size: number; color: string })
  | (Base & { kind: "image"; bytes: Bytes; type: "image/png" | "image/jpeg"; url?: string })
  | (Base & { kind: "rect" | "ellipse"; stroke: string; fill: string | null; strokeWidth: number })
  | (Base & { kind: "highlight" | "whiteout" })
  | (Base & { kind: "draw"; points: [number, number][]; color: string; strokeWidth: number });

/** Line height as a multiple of the font size, shared with the preview CSS. */
export const LINE_HEIGHT = 1.25;
/** Baseline offset from the top of a line, as a multiple of the font size. */
export const BASELINE = 0.9;
export const HIGHLIGHT = "#ffe95a";

type Geo = { W: number; H: number; r: number; dW: number; dH: number };
function geo(page: PDFPage): Geo {
  const { width: W, height: H } = page.getSize();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const rotated = r === 90 || r === 270;
  return { W, H, r, dW: rotated ? H : W, dH: rotated ? W : H };
}
/** Displayed fraction -> PDF user-space point (bottom-left origin), honouring /Rotate. */
function map(g: Geo, fx: number, fy: number): { x: number; y: number } {
  const dx = fx * g.dW, dy = fy * g.dH;
  if (g.r === 90) return { x: dy, y: dx };
  if (g.r === 180) return { x: g.W - dx, y: dy };
  if (g.r === 270) return { x: g.W - dy, y: g.H - dx };
  return { x: dx, y: g.H - dy };
}
const col = (hex: string) => { const c = hexToRgb(hex); return rgb(c.r, c.g, c.b); };

export async function applyEdits(bytes: Bytes, edits: Edit[], fontBytes: Record<string, Bytes>): Promise<Bytes> {
  const doc = await load(bytes);
  const fonts = new Map<string, PDFFont>();
  const fontFor = async (id: string) => {
    let f = fonts.get(id);
    if (!f) {
      const b = fontBytes[id];
      if (!b) throw new Error(`font ${id} not provided`);
      f = await embedFont(doc, b);
      fonts.set(id, f);
    }
    return f;
  };
  const images = new Map<Bytes, Awaited<ReturnType<typeof doc.embedPng>>>();

  for (const e of edits) {
    const page = doc.getPage(e.page);
    const g = geo(page);
    const rot = degrees(g.r);
    const dw = e.w * g.dW, dh = e.h * g.dH;
    // Anchor: the element's bottom-left corner in display space; pdf-lib rotates around it.
    const a = map(g, e.x, e.y + e.h);

    switch (e.kind) {
      case "text": {
        const font = await fontFor(e.font);
        const size = e.size * g.dW;
        const lines = e.text.split(/\r?\n/);
        const rtl = /[\u0590-\u08FF]/.test(e.text);
        lines.forEach((line, i) => {
          if (!line.trim()) return;
          const fy = e.y + (size * (BASELINE + LINE_HEIGHT * i)) / g.dH;
          const p = map(g, rtl ? e.x + e.w : e.x, fy);
          drawText(page, line, { font, size, x: p.x, y: p.y, align: rtl ? "right" : "left", color: hexToRgb(e.color), rotate: g.r });
        });
        break;
      }
      case "image": {
        let img = images.get(e.bytes);
        if (!img) {
          img = e.type === "image/png" ? await doc.embedPng(e.bytes) : await doc.embedJpg(e.bytes);
          images.set(e.bytes, img);
        }
        page.drawImage(img, { x: a.x, y: a.y, width: dw, height: dh, rotate: rot });
        break;
      }
      case "rect":
        page.drawRectangle({ x: a.x, y: a.y, width: dw, height: dh, rotate: rot, borderWidth: e.strokeWidth * g.dW, borderColor: col(e.stroke), color: e.fill ? col(e.fill) : undefined });
        break;
      case "ellipse": {
        const c = map(g, e.x + e.w / 2, e.y + e.h / 2);
        page.drawEllipse({ x: c.x, y: c.y, xScale: dw / 2, yScale: dh / 2, rotate: rot, borderWidth: e.strokeWidth * g.dW, borderColor: col(e.stroke), color: e.fill ? col(e.fill) : undefined });
        break;
      }
      case "highlight":
        page.drawRectangle({ x: a.x, y: a.y, width: dw, height: dh, rotate: rot, color: col(HIGHLIGHT), blendMode: BlendMode.Multiply });
        break;
      case "whiteout":
        page.drawRectangle({ x: a.x, y: a.y, width: dw, height: dh, rotate: rot, color: rgb(1, 1, 1) });
        break;
      case "draw": {
        const pts = e.points.map(([fx, fy]) => map(g, fx, fy));
        const thickness = Math.max(0.3, e.strokeWidth * g.dW);
        if (pts.length === 1) pts.push(pts[0]);
        for (let i = 1; i < pts.length; i++) {
          page.drawLine({ start: pts[i - 1], end: pts[i], thickness, color: col(e.color), lineCap: LineCapStyle.Round });
        }
        break;
      }
    }
  }
  return doc.save({ useObjectStreams: true });
}
