import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import * as core from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function count(bytes: Uint8Array, password?: string) {
  return (await core.load(bytes, password)).getPageCount();
}

// A 5-page fixture with a number on each page.
async function fixture(pages = 5): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Page ${i}`, { x: 40, y: 340, size: 24, font });
  }
  return doc.save();
}

const a = await fixture(5);
const b = await fixture(3);

// parsePageRanges
assert(core.parsePageRanges("1-3, 5", 5).join() === "0,1,2,4", "ranges basic");
assert(core.parsePageRanges("٢-٤", 5).join() === "1,2,3", "ranges arabic digits");
assert(core.parsePageRanges("4-", 5).join() === "3,4", "open range");
assert(core.parsePageRanges("9, 0, x", 5).length === 0, "out of range ignored");

// merge
assert((await count(await core.merge([a, b]))) === 8, "merge page count");

// pick / remove
assert((await count(await core.pickPages(a, [0, 2]))) === 2, "pick");
assert((await count(await core.removePages(a, [1, 3]))) === 3, "remove");
let threw = false;
try { await core.removePages(b, [0, 1, 2]); } catch { threw = true; }
assert(threw, "cannot remove all pages");

// split
assert((await core.split(a, { mode: "all" })).length === 5, "split all");
assert((await core.split(a, { mode: "every", pages: 2 })).length === 3, "split every 2");
const parts = await core.split(a, { mode: "ranges", ranges: ["1-2", "3-5"] });
assert(parts.length === 2 && (await count(parts[1])) === 3, "split ranges");

// rotate
const rotated = await core.load(await core.rotate(a, 90, [0]));
assert(rotated.getPage(0).getRotation().angle === 90, "rotate page 1");
assert(rotated.getPage(1).getRotation().angle === 0, "page 2 untouched");
const twice = await core.load(await core.rotate(await core.rotate(a, 270), 180));
assert(twice.getPage(0).getRotation().angle === 90, "rotation accumulates mod 360");

// organize
const org = await core.load(await core.organize(a, [4, 0, 2], { 0: 180 }));
assert(org.getPageCount() === 3 && org.getPage(1).getRotation().angle === 180, "organize");

// crop
const cropped = await core.load(await core.crop(a, { top: 10, right: 20, bottom: 30, left: 40 }));
const box = cropped.getPage(0).getCropBox();
assert(box.width === 240 && box.height === 360 && box.x === 40 && box.y === 30, "crop box");

// protect / unlock
const locked = await core.protect(a, "s3cret", { printing: true, copying: false });
assert(await core.isEncrypted(locked), "encrypted flag");
threw = false;
try { await core.load(locked); } catch (e) { threw = e instanceof core.PdfPasswordError; }
assert(threw, "opening without password throws PdfPasswordError");
threw = false;
try { await core.unlock(locked, "wrong"); } catch (e) { threw = e instanceof core.PdfPasswordError; }
assert(threw, "wrong password throws PdfPasswordError");
const unlocked = await core.unlock(locked, "s3cret");
assert(!(await core.isEncrypted(unlocked)) && (await count(unlocked)) === 5, "unlock");

// imagesToPdf (1x1 PNG)
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const fromImg = await core.load(await core.imagesToPdf([{ bytes: png, type: "image/png" }, { bytes: png, type: "image/png" }], { pageSize: "a4", margin: 20 }));
assert(fromImg.getPageCount() === 2 && Math.round(fromImg.getPage(0).getWidth()) === 595, "images to pdf a4");

console.log("pdf-core ok");
