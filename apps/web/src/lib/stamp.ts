/**
 * Stamp maker: builds a rubber-stamp design as SVG (pure, testable), and rasterises it to PNG in the browser.
 * Curved text uses SVG textPath so the browser shapes Arabic and lays it out right-to-left along the arc.
 */

export type StampShape = "round" | "oval" | "rect";
export type StampBorder = "double" | "single" | "none";

export type StampDesign = {
  shape: StampShape;
  /** Curved along the top (a straight top line for rectangles). */
  top: string;
  /** Curved along the bottom. */
  bottom: string;
  /** Straight line through the middle. */
  center: string;
  /** Optional line under the centre text (a date, a number...). */
  date: string;
  /** Data URL of an uploaded logo, drawn above the centre text. */
  logo: string | null;
  /** Recolour the logo with the ink colour (uses its alpha, for transparent PNGs). */
  logoTint: boolean;
  /** Bundled font id from @alarab/arabic. */
  font: string;
  /** Ink colour, #rrggbb. */
  color: string;
  border: StampBorder;
  /** Small stars between the top and bottom texts. */
  separators: boolean;
  /** 0 (crisp) to 100 (heavily worn). */
  worn: number;
  /** Text size multiplier, 0.6 to 1.4. */
  scale: number;
};

export const DEFAULT_STAMP: StampDesign = {
  shape: "round",
  top: "",
  bottom: "",
  center: "",
  date: "",
  logo: null,
  logoTint: true,
  font: "amiri-bold",
  color: "#1d3fa8",
  border: "double",
  separators: true,
  worn: 0,
  scale: 1,
};

export type BuildOptions = {
  /** CSS font-family the text uses. */
  fontFamily: string;
  /** An @font-face rule to embed (exports); omit for the live preview, where the page already loaded the font. */
  fontCss?: string;
};

export const STAMP_SIZE: Record<StampShape, { w: number; h: number }> = {
  round: { w: 400, h: 400 },
  oval: { w: 520, h: 360 },
  rect: { w: 520, h: 300 },
};

const RTL = /[֐-ࣿ]/;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Rough advance width per character in em, enough to keep long text inside the arc. */
function widthEm(s: string): number {
  let w = 0;
  for (const ch of s) w += /\s/.test(ch) ? 0.26 : /[0-9\u0660-\u0669\u06F0-\u06F9]/.test(ch) ? 0.6 : RTL.test(ch) ? 0.34 : /[A-Z]/.test(ch) ? 0.68 : 0.55;
  return w;
}

function fit(text: string, base: number, room: number, min: number): number {
  const need = widthEm(text) * base;
  return need <= room ? base : Math.max(min, (base * room) / need);
}

function star(cx: number, cy: number, r: number, color: string): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${color}"/>`;
}

function wornFilter(worn: number): string {
  if (worn <= 0) return "";
  const t = 0.3 + 0.2 * Math.min(1, worn / 100);
  // Fine grain plus coarse patches, averaged, then thresholded into an alpha mask that erodes the ink.
  return `<filter id="worn" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="fine"/>
<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="3" result="coarse"/>
<feComposite in="fine" in2="coarse" operator="arithmetic" k2="0.55" k3="0.45" result="noise"/>
<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 7 ${(-7 * t).toFixed(2)}" result="mask"/>
<feComposite in="SourceGraphic" in2="mask" operator="in"/>
</filter>`;
}

function textAttrs(s: string): string {
  return RTL.test(s) ? ' direction="rtl" unicode-bidi="isolate"' : "";
}

/** The complete SVG document for a design. Transparent background; the ink is the only colour. */
export function buildStampSvg(d: StampDesign, o: BuildOptions): string {
  const { w: W, h: H } = STAMP_SIZE[d.shape];
  const cx = W / 2, cy = H / 2;
  const ink = d.color;
  const family = `"${o.fontFamily}", "Amiri", "Noto Naskh Arabic", serif`;
  const parts: string[] = [];
  const defs: string[] = [];
  const scale = Math.min(1.4, Math.max(0.6, d.scale || 1));
  const filter = d.worn > 0 ? ' filter="url(#worn)"' : "";
  defs.push(wornFilter(d.worn));

  // Rings. Everything else sits inside `inner`.
  const outerStroke = 7, innerStroke = 2.5;
  const rx = cx - outerStroke, ry = cy - outerStroke; // outer ring radii (ellipse) or half sizes (rect)
  const gap = 15;
  let inner: number; // distance from the ring to the content, along the minor axis
  if (d.shape === "rect") {
    const r = 18;
    if (d.border !== "none") parts.push(`<rect x="${outerStroke}" y="${outerStroke}" width="${W - 2 * outerStroke}" height="${H - 2 * outerStroke}" rx="${r}" fill="none" stroke="${ink}" stroke-width="${outerStroke}"/>`);
    if (d.border === "double") parts.push(`<rect x="${outerStroke + gap}" y="${outerStroke + gap}" width="${W - 2 * (outerStroke + gap)}" height="${H - 2 * (outerStroke + gap)}" rx="${r - 6}" fill="none" stroke="${ink}" stroke-width="${innerStroke}"/>`);
    inner = d.border === "double" ? outerStroke + gap + innerStroke : d.border === "single" ? outerStroke + 4 : 4;
  } else {
    if (d.border !== "none") parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${ink}" stroke-width="${outerStroke}"/>`);
    if (d.border === "double") parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx - gap}" ry="${ry - gap}" fill="none" stroke="${ink}" stroke-width="${innerStroke}"/>`);
    inner = d.border === "double" ? outerStroke + gap + innerStroke : d.border === "single" ? outerStroke + 4 : 4;
  }

  const base = 30 * scale;

  if (d.shape === "rect") {
    // Straight lines: top, (logo), centre, date, bottom.
    const x0 = inner + 12, x1 = W - inner - 12, room = x1 - x0;
    const lines: { text: string; y: number; size: number; weight?: string }[] = [];
    const topSize = fit(d.top, base * 0.8, room, 10);
    const bottomSize = fit(d.bottom, base * 0.8, room, 10);
    const centerSize = fit(d.center, base * 1.15, room, 12);
    const dateSize = fit(d.date, base * 0.7, room, 10);
    const yTop = inner + 8 + topSize * 0.9;
    const yBottom = H - inner - 10 - bottomSize * 0.25;
    if (d.top) lines.push({ text: d.top, y: yTop, size: topSize });
    if (d.bottom) lines.push({ text: d.bottom, y: yBottom, size: bottomSize });
    // Middle block is centred between the top and bottom lines.
    const midTop = d.top ? yTop + topSize * 0.5 : inner + 8;
    const midBottom = d.bottom ? yBottom - bottomSize * 1.1 : H - inner - 8;
    const logoH = d.logo ? Math.min(90 * scale, (midBottom - midTop) * 0.45) : 0;
    const blockH = logoH + (d.center ? centerSize * 1.5 : 0) + (d.date ? dateSize * 1.4 : 0);
    let y = (midTop + midBottom) / 2 - blockH / 2;
    if (d.logo) { parts.push(logoMarkup(d, cx - logoH / 2, y, logoH, defs)); y += logoH + 4; }
    if (d.center) { y += centerSize; lines.push({ text: d.center, y, size: centerSize, weight: "bold" }); y += centerSize * 0.5; }
    if (d.date) { y += dateSize * 1.1; lines.push({ text: d.date, y, size: dateSize }); }
    if (d.separators) {
      const sy = (midTop + midBottom) / 2;
      parts.push(star(x0 + 10, sy, 9 * scale, ink), star(x1 - 10, sy, 9 * scale, ink));
    }
    for (const l of lines) parts.push(`<text x="${cx}" y="${l.y.toFixed(1)}" font-size="${l.size.toFixed(1)}"${l.weight ? ` font-weight="${l.weight}"` : ""} text-anchor="middle"${textAttrs(l.text)}>${esc(l.text)}</text>`);
  } else {
    // Curved text: baselines on ellipses inside the inner ring. Top text rises outward, bottom text rises inward.
    const arx = rx - inner, ary = ry - inner; // inner clear area
    const arc = 0.72; // share of the half-perimeter the text may use, so it clears the stars at the sides
    const topSize = fit(d.top, base, Math.PI * ((arx + ary) / 2 - base * 0.95) * arc, 10);
    const bottomSize = fit(d.bottom, base, Math.PI * ((arx + ary) / 2 - base * 0.3) * arc, 10);
    const tRx = arx - topSize * 0.95, tRy = ary - topSize * 0.95;
    const bRx = arx - bottomSize * 0.3, bRy = ary - bottomSize * 0.3;
    if (d.top) {
      defs.push(`<path id="tp" d="M ${(cx - tRx).toFixed(1)} ${cy} A ${tRx.toFixed(1)} ${tRy.toFixed(1)} 0 1 1 ${(cx + tRx).toFixed(1)} ${cy}"/>`);
      parts.push(`<text font-size="${topSize.toFixed(1)}"${textAttrs(d.top)}><textPath href="#tp" startOffset="50%" text-anchor="middle">${esc(d.top)}</textPath></text>`);
    }
    if (d.bottom) {
      defs.push(`<path id="bp" d="M ${(cx - bRx).toFixed(1)} ${cy} A ${bRx.toFixed(1)} ${bRy.toFixed(1)} 0 1 0 ${(cx + bRx).toFixed(1)} ${cy}"/>`);
      parts.push(`<text font-size="${bottomSize.toFixed(1)}"${textAttrs(d.bottom)}><textPath href="#bp" startOffset="50%" text-anchor="middle">${esc(d.bottom)}</textPath></text>`);
    }
    if (d.separators) {
      const sr = arx - base * 0.55;
      parts.push(star(cx - sr, cy, 8 * scale, ink), star(cx + sr, cy, 8 * scale, ink));
    }
    // Middle block: logo, centre line, date; must clear the curved text on both sides.
    const clearY = ary - base * 1.35; // half-height available in the middle
    const room = 2 * (arx - base * 1.6);
    const centerSize = fit(d.center, base * 1.15, room, 12);
    const dateSize = fit(d.date, base * 0.7, room * 0.9, 10);
    const logoH = d.logo ? Math.min(100 * scale, clearY * 0.9) : 0;
    const blockH = logoH + (d.center ? centerSize * 1.4 : 0) + (d.date ? dateSize * 1.4 : 0);
    let y = cy - blockH / 2;
    if (d.logo) { parts.push(logoMarkup(d, cx - logoH / 2, y, logoH, defs)); y += logoH + 4; }
    if (d.center) { y += centerSize * 0.95; parts.push(`<text x="${cx}" y="${y.toFixed(1)}" font-size="${centerSize.toFixed(1)}" font-weight="bold" text-anchor="middle"${textAttrs(d.center)}>${esc(d.center)}</text>`); y += centerSize * 0.45; }
    if (d.date) { y += dateSize * 1.1; parts.push(`<text x="${cx}" y="${y.toFixed(1)}" font-size="${dateSize.toFixed(1)}" text-anchor="middle"${textAttrs(d.date)}>${esc(d.date)}</text>`); }
  }

  const style = `${o.fontCss ?? ""}text{font-family:${family};fill:${ink};}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${defs.join("\n")}</defs>
<style>${style}</style>
<g${filter}>
${parts.join("\n")}
</g>
</svg>`;
}

function logoMarkup(d: StampDesign, x: number, y: number, h: number, defs: string[]): string {
  const href = esc(d.logo!);
  if (!d.logoTint) return `<image href="${href}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${h.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
  const { r, g, b } = hexToRgb(d.color);
  defs.push(`<filter id="tint" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 ${(r / 255).toFixed(3)}  0 0 0 0 ${(g / 255).toFixed(3)}  0 0 0 0 ${(b / 255).toFixed(3)}  0 0 0 1 0"/></filter>`);
  return `<image href="${href}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${h.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet" filter="url(#tint)"/>`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** True when the design has something to print. */
export function hasContent(d: StampDesign): boolean {
  return !!(d.top.trim() || d.bottom.trim() || d.center.trim() || d.date.trim() || d.logo);
}

/** A file name for the exports, from the centre or top text. */
export function stampFileName(d: StampDesign): string {
  const s = (d.center || d.top || d.bottom || "stamp").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 40);
  return s || "stamp";
}

function base64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/** An @font-face rule with the font embedded, so exports render the same everywhere. */
export function embeddedFontCss(family: string, ttf: Uint8Array): string {
  return `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${base64(ttf)}) format("truetype");}`;
}

/** Rasterise an SVG document to a transparent PNG of the given width (browser only). */
export async function svgToPng(svg: string, width: number): Promise<Blob> {
  const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const vw = Number(m?.[1] ?? 400), vh = Number(m?.[2] ?? 400);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("svg-decode")); img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round((width * vh) / vw);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
