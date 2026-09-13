import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import * as stamp from "./stamp.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function fixture(pages = 3) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([300, 400]).drawText(`Body ${i}`, { x: 40, y: 340, size: 20, font });
  return doc.save();
}
const fontBytes = new Uint8Array(readFileSync(new URL("../../arabic/fonts/tajawal-Tajawal-Regular.ttf", import.meta.url)));
const style = { fontBytes, size: 12, color: stamp.hexToRgb("#3346B8") };

assert(JSON.stringify(stamp.hexToRgb("#ff0000")) === JSON.stringify({ r: 1, g: 0, b: 0 }), "hex red");
assert(stamp.hexToRgb("nope").r === 0, "bad hex falls back to black");

const src = await fixture(3);

const numbered = await PDFDocument.load(await stamp.addPageNumbers(src, { style, position: "bottom-center", margin: 20, start: 1, template: "صفحة {n} من {total}", digits: "arab" }));
assert(numbered.getPageCount() === 3, "page count kept");
// Each page now has a content stream that references a new font resource.
const fonts = numbered.getPage(2).node.Resources()?.lookup(numbered.context.obj("Font") as never);
assert(fonts !== undefined, "font resource added");

const marked = await stamp.stampText(src, { text: "سري\nCONFIDENTIAL", style: { ...style, size: 36, opacity: 0.3 }, position: "center", margin: 0, rotate: 45, tile: true });
assert((await PDFDocument.load(marked)).getPageCount() === 3, "tiled watermark");
assert(marked.length > src.length, "watermark adds content");

let threw = false;
try { await stamp.stampText(src, { text: "  \n", style, position: "center", margin: 0 }); } catch { threw = true; }
assert(threw, "empty text rejected");

const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const withImage = await stamp.stampImage(src, { image: { bytes: png, type: "image/png" }, position: "top-right", margin: 10, widthRatio: 0.2, opacity: 0.5, pages: [0] });
assert((await PDFDocument.load(withImage)).getPageCount() === 3, "image stamp");

console.log("stamp ok");
