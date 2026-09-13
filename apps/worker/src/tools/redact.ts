import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, rgb } from "@cantoo/pdf-lib";
import { BIN, run, ToolError } from "../exec";
import { base, type ServerTool } from "./index";

type Box = { page: number; x: number; y: number; w: number; h: number };

/**
 * True redaction: every page with a box is rasterised (so no text, images or metadata survive
 * underneath), the boxes are painted black on the raster, and the page is replaced by that image.
 * Untouched pages are copied as they are.
 */
export const redactPdf: ServerTool = async ({ job, dir, inputs, progress }) => {
  const boxes = (Array.isArray(job.options.boxes) ? job.options.boxes : []) as Box[];
  if (!boxes.length) throw new ToolError("failed", "no boxes");
  const src = await PDFDocument.load(await readFile(inputs[0]), { ignoreEncryption: true });
  const pages = Array.from(new Set(boxes.map((b) => b.page))).filter((p) => p >= 0 && p < src.getPageCount()).sort((a, b) => a - b);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const prefix = join(dir, `p${p}`);
    await run(BIN.pdftoppm, ["-r", "200", "-f", String(p + 1), "-l", String(p + 1), "-png", "-singlefile", inputs[0], prefix], { cwd: dir, timeoutMs: 120_000 });
    const png = await src.embedPng(await readFile(`${prefix}.png`));
    const old = src.getPage(p);
    const { width, height } = old.getSize();
    const r = ((old.getRotation().angle % 360) + 360) % 360;
    const rotated = r === 90 || r === 270;
    // The raster is the DISPLAYED page; the new page takes the displayed size with no /Rotate.
    const dW = rotated ? height : width, dH = rotated ? width : height;
    const page = src.insertPage(p, [dW, dH]);
    page.drawImage(png, { x: 0, y: 0, width: dW, height: dH });
    for (const b of boxes.filter((b) => b.page === p)) {
      page.drawRectangle({ x: b.x * dW, y: dH - (b.y + b.h) * dH, width: b.w * dW, height: b.h * dH, color: rgb(0, 0, 0) });
    }
    src.removePage(p + 1);
    progress((i + 1) / pages.length);
  }
  src.setTitle("");
  src.setSubject("");
  src.setKeywords([]);
  const out = join(dir, "redacted.pdf");
  await writeFile(out, await src.save({ useObjectStreams: true }));
  return [{ path: out, name: `${base(job.files[0].name)}-redacted.pdf`, type: "application/pdf" }];
};
