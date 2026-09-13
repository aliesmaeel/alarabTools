export type DigitSystem = "arab" | "latn";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

/** Convert Western digits in a string to Arabic-Indic (١٢٣). */
export function toArabicIndic(s: string): string {
  return s.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/** Convert Arabic-Indic (٠-٩) and Extended (۰-۹) digits to Western. */
export function toWestern(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Format an integer in the requested digit system. */
export function formatDigits(n: number, system: DigitSystem): string {
  const s = String(Math.trunc(n));
  return system === "arab" ? toArabicIndic(s) : s;
}

/** The site default: Arabic-Indic on the Arabic site, Western on English. */
export function defaultDigits(locale: string): DigitSystem {
  return locale.startsWith("ar") ? "arab" : "latn";
}
