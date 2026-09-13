/**
 * Compositing text, logos and meme captions onto an ImageData with OffscreenCanvas.
 * Fonts must already be registered with the worker's FontFaceSet; pass the CSS family name.
 */

export type Layout = "center" | "tile" | "corner";
export type Position = "top-left" | "top-center" | "top-right" | "center" | "bottom-left" | "bottom-center" | "bottom-right";

export type PlaceOptions = {
  /** 0..1 */
  opacity: number;
  /** degrees, counter-clockwise positive like the PDF tools */
  rotate: number;
  layout: Layout;
  position: Position;
  /** pixels from the edge for the corner layout */
  margin: number;
};

export type TextStyle = { text: string; family: string; size: number; color: string };

const RTL = /[\u0590-\u08FF]/;

function toCanvas(img: ImageData): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.putImageData(img, 0, 0);
  return [canvas, ctx];
}

/** Render multi-line text on a transparent canvas, sized to fit. The browser handles shaping and bidi. */
export function textLayer(s: TextStyle): OffscreenCanvas {
  const lines = s.text.split(/\r?\n/);
  const lh = s.size * 1.35;
  const pad = s.size * 0.3;
  const probe = new OffscreenCanvas(8, 8).getContext("2d")!;
  probe.font = `${s.size}px "${s.family}"`;
  const width = Math.max(...lines.map((l) => probe.measureText(l).width), 1);
  const canvas = new OffscreenCanvas(Math.ceil(width + 2 * pad), Math.ceil(lh * lines.length + 2 * pad));
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${s.size}px "${s.family}"`;
  ctx.fillStyle = s.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.direction = RTL.test(s.text) ? "rtl" : "ltr";
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, pad + lh * (i + 0.5)));
  return canvas;
}

/** Composite a layer onto the image following the layout rules shared by all stamp tools. */
export function place(img: ImageData, layer: OffscreenCanvas | ImageBitmap, o: PlaceOptions): ImageData {
  const [canvas, ctx] = toCanvas(img);
  const W = img.width, H = img.height, w = layer.width, h = layer.height;
  const rad = (-o.rotate * Math.PI) / 180;
  ctx.globalAlpha = Math.min(1, Math.max(0, o.opacity));
  const draw = (cx: number, cy: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.drawImage(layer, -w / 2, -h / 2);
    ctx.restore();
  };
  if (o.layout === "center") {
    draw(W / 2, H / 2);
  } else if (o.layout === "tile") {
    const gapX = w * 0.6, gapY = h * 1.2;
    let row = 0;
    for (let y = h / 2; y < H + h; y += h + gapY, row++) {
      const offset = row % 2 ? (w + gapX) / 2 : 0;
      for (let x = w / 2 - offset; x < W + w; x += w + gapX) draw(x, y);
    }
  } else {
    // Rotated bounding box so the stamp never leaves the image.
    const bw = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
    const bh = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
    const [v, hz] = o.position === "center" ? ["center", "center"] : o.position.split("-");
    const cx = hz === "left" ? o.margin + bw / 2 : hz === "right" ? W - o.margin - bw / 2 : W / 2;
    const cy = v === "top" ? o.margin + bh / 2 : v === "bottom" ? H - o.margin - bh / 2 : H / 2;
    draw(cx, cy);
  }
  return ctx.getImageData(0, 0, W, H);
}

export function stampText(img: ImageData, style: TextStyle, o: PlaceOptions): ImageData {
  return place(img, textLayer(style), o);
}

/** Scale the overlay to `widthPercent` of the image width (never larger than the image) and place it. */
export async function stampImage(img: ImageData, overlay: ImageData, widthPercent: number, o: PlaceOptions): Promise<ImageData> {
  const tw = Math.max(1, Math.round(Math.min(img.width, (img.width * widthPercent) / 100)));
  const th = Math.max(1, Math.round((overlay.height * tw) / overlay.width));
  const bitmap = await createImageBitmap(overlay, { resizeWidth: tw, resizeHeight: th, resizeQuality: "high" });
  try {
    return place(img, bitmap, o);
  } finally {
    bitmap.close();
  }
}

export type MemeOptions = {
  top: string;
  bottom: string;
  family: string;
  /** font size in px */
  size: number;
  color: string;
  stroke: string;
};

/** Word-wrap a line to `maxWidth` using the current ctx font. */
function wrap(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; }
      else line = next;
    }
    if (line || !words.length) out.push(line);
  }
  return out;
}

/** Classic meme captions: outlined text at the top and bottom, wrapped to the image width. */
export function memeCaptions(img: ImageData, o: MemeOptions): ImageData {
  const [canvas, ctx] = toCanvas(img);
  const W = img.width, H = img.height;
  ctx.font = `${o.size}px "${o.family}"`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, o.size / 9);
  ctx.strokeStyle = o.stroke;
  ctx.fillStyle = o.color;
  const lh = o.size * 1.25;
  const pad = o.size * 0.4;
  const drawLine = (text: string, y: number) => {
    ctx.direction = RTL.test(text) ? "rtl" : "ltr";
    ctx.strokeText(text, W / 2, y);
    ctx.fillText(text, W / 2, y);
  };
  if (o.top.trim()) {
    ctx.textBaseline = "top";
    wrap(ctx, o.top.trim(), W * 0.92).forEach((line, i) => drawLine(line, pad + i * lh));
  }
  if (o.bottom.trim()) {
    ctx.textBaseline = "bottom";
    const lines = wrap(ctx, o.bottom.trim(), W * 0.92);
    lines.forEach((line, i) => drawLine(line, H - pad - (lines.length - 1 - i) * lh));
  }
  return ctx.getImageData(0, 0, W, H);
}
