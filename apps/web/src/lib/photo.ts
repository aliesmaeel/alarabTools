/**
 * Photo editor rendering, shared by the live preview and the export so they match exactly.
 * Positions are fractions of the image and sizes are percentages of its width, so the same
 * state renders identically at preview and full resolution.
 */
import type { FontId } from "@alarab/arabic";

export type Adjust = { brightness: number; contrast: number; saturation: number; hue: number; blur: number; grayscale: number; sepia: number; invert: boolean };
export type Layer = { id: string; kind: "text" | "sticker"; text: string; font: FontId; size: number; color: string; outline: boolean; x: number; y: number };
export type Frame = { width: number; color: string; radius: number };
export type PhotoState = { preset: PresetId; adjust: Adjust; layers: Layer[]; frame: Frame; format: "same" | "jpeg" | "png"; selected: string | null };

export const DEFAULT_ADJUST: Adjust = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: false };

export type PresetId = "none" | "vivid" | "bw" | "vintage" | "cool" | "warm" | "soft";
export const PRESETS: Record<PresetId, Partial<Adjust>> = {
  none: {},
  vivid: { contrast: 115, saturation: 140 },
  bw: { grayscale: 100, contrast: 110 },
  vintage: { sepia: 60, contrast: 90, brightness: 105, saturation: 80 },
  cool: { hue: 15, saturation: 90, brightness: 104 },
  warm: { hue: -12, saturation: 115, brightness: 103 },
  soft: { contrast: 85, brightness: 108, blur: 1, saturation: 90 },
};

export const STICKERS = ["😀", "😂", "😍", "🥳", "😎", "🤔", "👍", "👏", "🔥", "❤️", "⭐", "✅", "🎉", "🎈", "🌙", "☀️", "🌴", "☕", "🕌", "📌", "💡", "🏆", "🚀", "🌹"];

export const EMOJI_FAMILY = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Twemoji Mozilla", sans-serif';

export function filterString(a: Adjust): string {
  const parts: string[] = [];
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness}%)`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast}%)`);
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation}%)`);
  if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.grayscale) parts.push(`grayscale(${a.grayscale}%)`);
  if (a.sepia) parts.push(`sepia(${a.sepia}%)`);
  if (a.invert) parts.push("invert(100%)");
  if (a.blur) parts.push(`blur(${a.blur}px)`);
  return parts.length ? parts.join(" ") : "none";
}

export type LayerBox = { id: string; x: number; y: number; w: number; h: number };

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * Draw the edited photo into `ctx` (already sized W×H). `scale` is W divided by the original width,
 * so blur radii stay proportional on the downscaled preview. Returns each layer's box in px.
 */
export function renderPhoto(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  W: number,
  H: number,
  s: PhotoState,
  families: Partial<Record<FontId, string>>,
  scale = 1,
): LayerBox[] {
  const boxes: LayerBox[] = [];
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const adjust = s.adjust.blur ? { ...s.adjust, blur: Math.max(0.5, s.adjust.blur * scale) } : s.adjust;
  if ("filter" in ctx) ctx.filter = filterString(adjust);
  ctx.drawImage(source, 0, 0, W, H);
  if ("filter" in ctx) ctx.filter = "none";
  ctx.restore();

  for (const l of s.layers) {
    const size = (W * l.size) / 100;
    const family = l.kind === "sticker" ? EMOJI_FAMILY : `"${families[l.font] ?? "sans-serif"}"`;
    ctx.save();
    ctx.font = `${size}px ${family}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = /[\u0590-\u08FF]/.test(l.text) ? "rtl" : "ltr";
    const lines = l.text.split(/\r?\n/);
    const lh = size * 1.25;
    const cx = l.x * W, cy = l.y * H;
    const top = cy - (lh * lines.length) / 2;
    let maxW = 0;
    lines.forEach((line, i) => {
      const y = top + lh * (i + 0.5);
      maxW = Math.max(maxW, ctx.measureText(line).width);
      if (l.kind === "text" && l.outline) {
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(1, size / 12);
        ctx.strokeStyle = luminance(l.color) > 0.5 ? "#000000" : "#ffffff";
        ctx.strokeText(line, cx, y);
      }
      ctx.fillStyle = l.color;
      ctx.fillText(line, cx, y);
    });
    ctx.restore();
    const w = Math.max(maxW, size) + size * 0.4, h = lh * lines.length + size * 0.2;
    boxes.push({ id: l.id, x: cx - w / 2, y: cy - h / 2, w, h });
  }

  if (s.frame.width > 0) {
    const fw = (Math.min(W, H) * s.frame.width) / 100;
    const r = (Math.min(W, H) * s.frame.radius) / 100;
    ctx.save();
    ctx.fillStyle = s.frame.color;
    const ring = new Path2D();
    ring.rect(0, 0, W, H);
    ring.roundRect(fw, fw, W - 2 * fw, H - 2 * fw, Math.min(r, (Math.min(W, H) - 2 * fw) / 2));
    ctx.fill(ring, "evenodd");
    ctx.restore();
  }
  return boxes;
}

let counter = 0;
export function newLayer(kind: Layer["kind"], text: string, font: FontId): Layer {
  return { id: `${kind}-${Date.now().toString(36)}-${counter++}`, kind, text, font, size: kind === "sticker" ? 14 : 8, color: "#ffffff", outline: true, x: 0.5, y: kind === "sticker" ? 0.5 : 0.85 };
}
