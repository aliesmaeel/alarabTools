import { toArabicIndic, toWestern, type DigitSystem } from "./digits.ts";

export type DateParts = { day: number; month: number; year: number };

/** Umm al-Qura Hijri date for a Gregorian date, via the platform calendar. */
export function toHijri(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { day: get("day"), month: get("month"), year: get("year") };
}

const HIJRI_MONTHS_AR = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
const HIJRI_MONTHS_EN = ["Muharram", "Safar", "Rabi' I", "Rabi' II", "Jumada I", "Jumada II", "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah"];

export type DateStyle = "numeric" | "long";

function applyDigits(s: string, digits: DigitSystem) {
  return digits === "arab" ? toArabicIndic(s) : toWestern(s);
}

/** e.g. "٣٠ ربيع الأول ١٤٤٨ هـ" or "30/3/1448 AH". */
export function formatHijri(date: Date, locale: "ar" | "en", style: DateStyle, digits: DigitSystem): string {
  const h = toHijri(date);
  const era = locale === "ar" ? "هـ" : "AH";
  if (style === "numeric") return applyDigits(`${h.day}/${h.month}/${h.year} ${era}`, digits);
  const month = (locale === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN)[h.month - 1];
  return applyDigits(`${h.day} ${month} ${h.year} ${era}`, digits);
}

/** e.g. "١٢ سبتمبر ٢٠٢٦ م" or "12 September 2026". */
export function formatGregorian(date: Date, locale: "ar" | "en", style: DateStyle, digits: DigitSystem): string {
  if (style === "numeric") {
    const s = `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${date.getUTCFullYear()}${locale === "ar" ? " م" : ""}`;
    return applyDigits(s, digits);
  }
  const month = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { month: "long", timeZone: "UTC" }).format(date);
  const s = `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}${locale === "ar" ? " م" : ""}`;
  return applyDigits(s, digits);
}
