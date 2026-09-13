import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, TextRenderingMode, popGraphicsState, pushGraphicsState, setTextRenderingMode, type PDFFont } from "@cantoo/pdf-lib";
import { drawText, embedFont } from "@alarab/arabic";
import { NoProviderError, ocr as gatewayOcr, type OcrPage } from "@alarab/ai";
import { BIN, run, ToolError } from "../exec";
import { base, type ServerTool, type ToolContext } from "./index";

const DPI = 200;
const FONT_DIR = process.env.FONT_DIR || join(process.cwd(), "..", "..", "packages", "arabic", "fonts");

async function pngSize(path: string): Promise<{ width: number; height: number }> {
  const b = await readFile(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** Rasterise one page (or accept an image input) and OCR it through the gateway. */
async function recognise(ctx: ToolContext, imagePath: string, languages: string[]): Promise<OcrPage> {
  const { width, height } = await pngSize(imagePath);
  const image = new Uint8Array(await readFile(imagePath));
  try {
    const { result } = await gatewayOcr({ image, mime: "image/png", width, height, languages }, { region: ctx.job.region ?? "eu", source: ctx.job.source });
    return result;
  } catch (e) {
    if (e instanceof NoProviderError) throw new ToolError("no-provider", e.tried.map((t) => `${t.id}: ${t.skipped}`).join("; "));
    throw e;
  }
}

/** Invisible text on top of each page, positioned by the recognised word boxes, so the PDF becomes searchable. */
async function overlay(doc: PDFDocument, pageIndex: number, page: OcrPage, fonts: { ar: PDFFont; en: PDFFont }) {
  const p = doc.getPage(pageIndex);
  const { width: W, height: H } = p.getSize();
  p.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
  for (const line of page.lines) {
    for (const w of line.words) {
      if (!w.text.trim()) continue;
      const rtl = /[؀-ۿ]/.test(w.text);
      const font = rtl ? fonts.ar : fonts.en;
      const boxW = w.w * W, boxH = w.h * H;
      // Size the text to the box height, then shrink to fit its width.
      let size = Math.max(4, boxH * 0.85);
      const natural = font.widthOfTextAtSize(w.text, size);
      if (natural > boxW && natural > 0) size = Math.max(3, size * (boxW / natural));
      const x = rtl ? (w.x + w.w) * W : w.x * W;
      const y = H - (w.y + w.h) * H + boxH * 0.2;
      drawText(p, w.text, { font, size, x, y, align: rtl ? "right" : "left" });
    }
  }
  p.pushOperators(popGraphicsState());
}

export const ocrPdf: ServerTool = async (ctx) => {
  const { job, dir, inputs, progress } = ctx;
  const languages = job.options.language === "en" ? ["en"] : job.options.language === "ar" ? ["ar"] : ["ar", "en"];
  const input = inputs[0];
  const isPdf = job.files[0].type === "application/pdf" || /\.pdf$/i.test(job.files[0].name);

  let doc: PDFDocument;
  const pageImages: string[] = [];
  if (isPdf) {
    doc = await PDFDocument.load(await readFile(input), { ignoreEncryption: true });
    const n = Math.min(doc.getPageCount(), 50);
    for (let i = 0; i < n; i++) {
      const prefix = join(dir, `p${i}`);
      await run(BIN.pdftoppm, ["-r", String(DPI), "-f", String(i + 1), "-l", String(i + 1), "-png", "-singlefile", input, prefix], { cwd: dir, timeoutMs: 120_000 });
      pageImages.push(`${prefix}.png`);
    }
  } else {
    // Image input: wrap it in a one-page PDF at 200 dpi.
    const png = join(dir, "p0.png");
    await run("convert", [input, "-auto-orient", png], { cwd: dir, timeoutMs: 60_000 });
    const { width, height } = await pngSize(png);
    doc = await PDFDocument.create();
    const img = await doc.embedPng(await readFile(png));
    const page = doc.addPage([(width * 72) / DPI, (height * 72) / DPI]);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    pageImages.push(png);
  }

  const fonts = {
    ar: await embedFont(doc, new Uint8Array(await readFile(join(FONT_DIR, "amiri-Amiri-Regular.ttf")))),
    en: await embedFont(doc, new Uint8Array(await readFile(join(FONT_DIR, "tajawal-Tajawal-Regular.ttf")))),
  };
  const textOut: string[] = [];
  for (let i = 0; i < pageImages.length; i++) {
    const page = await recognise(ctx, pageImages[i], languages);
    await overlay(doc, i, page, fonts);
    textOut.push(page.text);
    progress((i + 1) / pageImages.length);
  }
  const outPdf = join(dir, "ocr.pdf");
  await writeFile(outPdf, await doc.save({ useObjectStreams: true }));
  const outTxt = join(dir, "ocr.txt");
  await writeFile(outTxt, textOut.join("\n\n"));
  const name = base(job.files[0].name);
  return [
    { path: outPdf, name: `${name}-searchable.pdf`, type: "application/pdf" },
    { path: outTxt, name: `${name}.txt`, type: "text/plain" },
  ];
};

/** Plain text of a PDF, or "" when it has no text layer (a scan). Bidi control marks stripped. */
export async function pdfText(input: string, dir: string): Promise<string> {
  const r = await run(BIN.pdftotext, ["-layout", "-enc", "UTF-8", input, "-"], { cwd: dir, timeoutMs: 60_000 });
  return r.stdout.replace(/[‎‏‪-‮⁦-⁩]/g, "");
}
