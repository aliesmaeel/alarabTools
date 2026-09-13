import { join } from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync } from "fflate";
import { detectFlippedRuns, fixArabicText, flipLtrRuns, normalizeForms } from "@alarab/arabic";
import { BIN, run, ToolError } from "../exec";
import { docx, layoutToRows, xlsx } from "../office";
import { pdfText, ocrPdf } from "./ocr";
import { base, type ServerTool, type ToolContext } from "./index";

async function libreoffice(ctx: ToolContext, input: string, filter: string, target: string): Promise<string> {
  const profile = join(ctx.dir, "lo-profile");
  const outDir = join(ctx.dir, "lo-out");
  await mkdir(profile, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await run(BIN.soffice, [`-env:UserInstallation=file://${profile}`, "--headless", "--norestore", "--nologo", `--infilter=${filter}`, "--convert-to", target, "--outdir", outDir, input], { cwd: ctx.dir, timeoutMs: 4 * 60 * 1000 });
  const ext = target.split(":")[0];
  const produced = (await readdir(outDir)).find((f) => f.endsWith(`.${ext}`));
  if (!produced) throw new ToolError("failed", `LibreOffice produced no ${ext}`);
  return join(outDir, produced);
}

const XML_DECODE = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const XML_ENCODE = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Fix a DOCX in place. Runs split words and numbers apart, so each paragraph is judged as a whole
 * (does it look flipped?) and the decision is applied to every run in it.
 */
async function fixDocx(path: string, out: string, force: boolean | "auto" = "auto"): Promise<number> {
  const files = unzipSync(new Uint8Array(await readFile(path)));
  let fixes = 0;
  for (const name of Object.keys(files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = new TextDecoder().decode(files[name]);
    const paraText = (para: string) => normalizeForms(Array.from(para.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g), (m) => XML_DECODE(m[1])).join(""));
    const paras = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
    // One converter flipped the whole file or none of it: a single paragraph with a backwards year or
    // date is enough evidence to flip every Arabic paragraph (a plain "54321" alone proves nothing).
    const docFlipped = force === true || (force === "auto" && paras.some((p) => detectFlippedRuns(paraText(p))));
    const fixed = xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, (para) => {
      const whole = paraText(para);
      if (!/[\u0600-\u06FF]/.test(whole)) return para;
      const flip = docFlipped;
      return para.replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (_m, open: string, text: string, close: string) => {
        const decoded = XML_DECODE(text);
        let next = fixArabicText(decoded, { reverseLtrRuns: false }).text;
        if (flip) next = flipLtrRuns(next);
        if (next !== decoded) fixes++;
        return open + XML_ENCODE(next) + close;
      });
    });
    files[name] = new TextEncoder().encode(fixed);
  }
  await writeFile(out, zipSync(files, { level: 6 }));
  return fixes;
}

/** Word: LibreOffice's PDF import for text PDFs (then the Arabic fixer); OCR text for scans. */
export const pdfToWord: ServerTool = async (ctx) => {
  const { job, dir, inputs } = ctx;
  const name = base(job.files[0].name);
  const text = await pdfText(inputs[0], dir);
  const out = join(dir, `${name}.docx`);
  if (text.trim().length < 20) {
    // A scan: recognise it, then build a simple document from the lines.
    const [, txt] = await ocrPdf({ ...ctx, progress: (f) => ctx.progress(f * 0.9) });
    const lines = (await readFile(txt.path, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    await writeFile(out, docx(lines.length ? lines : ["(no text recognised)"], "Amiri"));
  } else {
    const produced = await libreoffice(ctx, inputs[0], "writer_pdf_import", "docx:MS Word 2007 XML");
    await fixDocx(produced, out);
  }
  return [{ path: out, name: `${name}.docx`, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }];
};

/** Excel: text layout split into columns on wide gaps; one sheet, numbers kept numeric. */
export const pdfToExcel: ServerTool = async (ctx) => {
  const { job, dir, inputs } = ctx;
  const name = base(job.files[0].name);
  const text = await pdfText(inputs[0], dir);
  if (text.trim().length < 5) throw new ToolError("no-text");
  const rows = layoutToRows(fixArabicText(text).text);
  const out = join(dir, `${name}.xlsx`);
  await writeFile(out, xlsx(rows, name.slice(0, 30) || "Sheet1"));
  return [{ path: out, name: `${name}.xlsx`, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }];
};

/** PowerPoint: LibreOffice Impress import keeps each page as a slide with positioned text. */
export const pdfToPowerpoint: ServerTool = async (ctx) => {
  const name = base(ctx.job.files[0].name);
  const produced = await libreoffice(ctx, ctx.inputs[0], "impress_pdf_import", "pptx:Impress MS PowerPoint 2007 XML");
  return [{ path: produced, name: `${name}.pptx`, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }];
};

/** Standalone fixer for .txt, .docx and text PDFs. Reports what it changed in the job note. */
export const fixArabicText_: ServerTool = async (ctx) => {
  const { job, dir, inputs } = ctx;
  const file = job.files[0];
  const name = base(file.name);
  const force = job.options.reverseLtrRuns === true ? true : "auto";
  if (/\.docx$/i.test(file.name)) {
    const out = join(dir, `${name}-fixed.docx`);
    await fixDocx(inputs[0], out, force);
    return [{ path: out, name: `${name}-fixed.docx`, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }];
  }
  const raw = /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await pdfText(inputs[0], dir) : await readFile(inputs[0], "utf8");
  const { text } = fixArabicText(raw, { reverseLtrRuns: force });
  const out = join(dir, `${name}-fixed.txt`);
  await writeFile(out, text);
  return [{ path: out, name: `${name}-fixed.txt`, type: "text/plain" }];
};
export { fixArabicText_ as fixArabicText };
