import { readFileSync } from "node:fs";
import { PDFDocument } from "@cantoo/pdf-lib";
import * as ar from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

// digits
eq(ar.formatDigits(1448, "arab"), "١٤٤٨", "arab digits");
eq(ar.formatDigits(1448, "latn"), "1448", "latin digits");
eq(ar.toWestern("٣٠/٣/۱۴۴۸"), "30/3/1448", "to western incl. extended");
eq(ar.defaultDigits("ar"), "arab", "default ar");
eq(ar.defaultDigits("en"), "latn", "default en");

// hijri: 2026-09-12 is 1 Rabi' II 1448 in Umm al-Qura
const d = new Date(Date.UTC(2026, 8, 12));
eq(ar.toHijri(d), { day: 1, month: 4, year: 1448 }, "umm al-qura");
eq(ar.formatHijri(d, "ar", "long", "arab"), "١ ربيع الآخر ١٤٤٨ هـ", "hijri ar long");
eq(ar.formatHijri(d, "en", "numeric", "latn"), "1/4/1448 AH", "hijri en numeric");
eq(ar.formatGregorian(d, "ar", "long", "arab"), "١٢ سبتمبر ٢٠٢٦ م", "gregorian ar long");
eq(ar.formatGregorian(d, "en", "long", "latn"), "12 September 2026", "gregorian en long");

// bidi runs (visual order, RTL runs in logical order)
eq(ar.visualRuns("سلام"), [{ text: "سلام", rtl: true }], "pure arabic");
eq(ar.visualRuns("hello"), [{ text: "hello", rtl: false }], "pure latin");
// "صفحة 12": number sits visually to the LEFT of the Arabic word
eq(ar.visualRuns("صفحة 12"), [{ text: "12", rtl: false }, { text: "صفحة ", rtl: true }], "arabic + number");
// Latin paragraph with an Arabic word inside
// Per the Unicode bidi algorithm a number after an Arabic word displays to its left: "Page 3 10 من"
eq(ar.visualRuns("Page 3 من 10"), [{ text: "Page 3 10", rtl: false }, { text: "من ", rtl: true }], "mixed ltr");
// brackets are mirrored inside RTL runs
eq(ar.visualRuns("(نص)"), [{ text: ")نص(", rtl: true }], "mirrored brackets");
// Arabic-Indic digits sit in an LTR run but fontkit treats them as Arabic script and reverses
// them, so they are handed over pre-reversed (Latin digits are left alone).
// (The paragraph is RTL, so the number sits on the right and the word on the left.)
eq(ar.visualRuns("١٢٣ ريال"), [{ text: " ريال", rtl: true }, { text: "٣٢١", rtl: false }], "arabic-indic digits pre-reversed");
eq(ar.visualRuns("التاريخ: ١٤٤٨/٠٤/٠١"), [{ text: "٨٤٤١", rtl: false }, { text: "/", rtl: false }, { text: "٤٠", rtl: false }, { text: "/", rtl: false }, { text: "١٠", rtl: false }, { text: "التاريخ: ", rtl: true }], "date with arabic-indic digits");
eq(ar.visualRuns("عام 2026 ميلادي"), [{ text: " ميلادي", rtl: true }, { text: "2026", rtl: false }, { text: "عام ", rtl: true }], "latin digits untouched");
assert(ar.isRtl("مرحبا world") && !ar.isRtl("hello عالم"), "isRtl by first strong char");

// drawing with a real font: shaped glyphs and widths
const doc = await PDFDocument.create();
const font = await ar.embedFont(doc, new Uint8Array(readFileSync(new URL("../fonts/amiri-Amiri-Regular.ttf", import.meta.url))));
const page = doc.addPage([400, 200]);
const w = ar.drawText(page, "صفحة ١ من ١٠", { font, size: 18, x: 200, y: 100, align: "center" });
assert(w > 50 && w < 200, `width plausible: ${w}`);
assert(Math.abs(ar.widthOf(font, "صفحة ١ من ١٠", 18) - w) < 0.01, "widthOf matches drawn width");
// Joined "سلام" must be narrower than four isolated letters.
const joined = font.widthOfTextAtSize("سلام", 18);
const isolated = ["س", "ل", "ا", "م"].reduce((a, c) => a + font.widthOfTextAtSize(c, 18), 0);
assert(joined < isolated, `shaping joins letters: ${joined} < ${isolated}`);
ar.drawText(page, "Rotated نص", { font, size: 14, x: 50, y: 30, rotate: 45, opacity: 0.5, color: { r: 1, g: 0, b: 0 } });
const bytes = await doc.save();
assert(bytes.length > 1000 && bytes.length < 200_000, `subset font keeps the file small: ${bytes.length}`);

// variable font (Reem Kufi) embeds too
const doc2 = await PDFDocument.create();
const kufi = await ar.embedFont(doc2, new Uint8Array(readFileSync(new URL("../fonts/reemkufi-ReemKufi[wght].ttf", import.meta.url))));
ar.drawText(doc2.addPage(), "ختم التاريخ", { font: kufi, size: 30, x: 20, y: 20 });
await doc2.save();

// Arabic text fixes
{
  const r = ar.fixArabicText("\uFEFB\uFEB4\uFEE0\uFE8E\uFEE1 \u202Bعليكم\u202C");
  assert(!/[\uFB50-\uFDFF\uFE70-\uFEFF\u202B\u202C]/.test(r.text), "presentation forms and bidi marks removed");
  assert(r.report.presentationForms && r.report.bidiMarks, "report flags");
  // A line stored visually: each word reversed and word order flipped.
  const visual = "ةكرشلا ريدم ىلإ باتكلا اذه"; // "هذا الكتاب إلى مدير الشركة" reversed
  eq(ar.fixArabicText(visual).text, "هذا الكتاب إلى مدير الشركة", "visual line restored");
  eq(ar.fixArabicText("هذا الكتاب إلى مدير الشركة").text, "هذا الكتاب إلى مدير الشركة", "logical line untouched");
  // LibreOffice-style flipped numbers inside Arabic lines.
  eq(ar.fixArabicText("عام 6202 ميلادي").text, "عام 2026 ميلادي", "flipped year");
  eq(ar.fixArabicText("التاريخ: ١٠/٤٠/٨٤٤١").text, "التاريخ: ١٤٤٨/٠٤/٠١", "flipped arabic-indic date");
  eq(ar.fixArabicText("عام 2026 ميلادي").text, "عام 2026 ميلادي", "correct year untouched");
  eq(ar.fixArabicText("من 01 3 egaP", { reverseLtrRuns: true }).text, "من 10 3 Page", "forced run reversal");
  eq(ar.fixArabicText("Page 3 of 10").text, "Page 3 of 10", "latin lines untouched");
}
console.log("arabic ok");
