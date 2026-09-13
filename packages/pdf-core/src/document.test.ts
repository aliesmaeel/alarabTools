import { readFileSync } from "node:fs";
import { PDFDocument } from "@cantoo/pdf-lib";
import { textDocument } from "./document.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const fontBytes = new Uint8Array(readFileSync(new URL("../../arabic/fonts/amiri-Amiri-Regular.ttf", import.meta.url)));

const fit = await PDFDocument.load(await textDocument({ text: "بسم الله الرحمن الرحيم\nسطر ثانٍ", fontBytes, size: 24, align: "start", pageSize: "fit", margin: 20 }));
assert(fit.getPageCount() === 1, "fit: one page");
const { width, height } = fit.getPage(0).getSize();
assert(width > 100 && width < 400 && Math.round(height) === Math.round(24 * 1.6 * 2 + 40), `fit page size ${width}x${height}`);

const long = Array.from({ length: 80 }, (_, i) => `سطر رقم ${i + 1} في مستند طويل نسبيًا لاختبار الالتفاف والتقسيم إلى صفحات`).join("\n");
const a5 = await PDFDocument.load(await textDocument({ text: long, fontBytes, size: 14, align: "start", pageSize: "a5", margin: 40 }));
assert(a5.getPageCount() >= 4, `a5 paginates: ${a5.getPageCount()} pages`);
assert(Math.round(a5.getPage(0).getWidth()) === 420, "a5 width");

console.log("document ok");
