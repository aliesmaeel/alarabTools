/** Bundled OFL fonts. Files live in packages/arabic/fonts and are copied to the web app's public folder. */
export type FontId = "amiri" | "amiri-bold" | "tajawal" | "tajawal-bold" | "reem-kufi" | "aref-ruqaa";

export type FontInfo = {
  id: FontId;
  file: string;
  /** Calligraphic style, for the picker. */
  style: "naskh" | "sans" | "kufi" | "ruqaa";
  name: { ar: string; en: string };
  bold?: boolean;
};

export const FONTS: readonly FontInfo[] = [
  { id: "amiri", file: "amiri-Amiri-Regular.ttf", style: "naskh", name: { ar: "أميري (نسخ)", en: "Amiri (Naskh)" } },
  { id: "amiri-bold", file: "amiri-Amiri-Bold.ttf", style: "naskh", bold: true, name: { ar: "أميري عريض", en: "Amiri Bold" } },
  { id: "tajawal", file: "tajawal-Tajawal-Regular.ttf", style: "sans", name: { ar: "تجوال (حديث)", en: "Tajawal (Sans)" } },
  { id: "tajawal-bold", file: "tajawal-Tajawal-Bold.ttf", style: "sans", bold: true, name: { ar: "تجوال عريض", en: "Tajawal Bold" } },
  { id: "reem-kufi", file: "reemkufi-ReemKufi[wght].ttf", style: "kufi", name: { ar: "ريم كوفي", en: "Reem Kufi" } },
  { id: "aref-ruqaa", file: "arefruqaa-ArefRuqaa-Regular.ttf", style: "ruqaa", name: { ar: "عارف رقعة", en: "Aref Ruqaa" } },
];

export const DEFAULT_FONT: FontId = "tajawal";

export function fontInfo(id: string): FontInfo {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}
