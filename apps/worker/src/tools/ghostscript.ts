import { join } from "node:path";
import { stat, writeFile } from "node:fs/promises";
import { BIN, run, ToolError } from "../exec";
import { base, type ServerTool, type ToolOutput } from "./index";

const TIMEOUT = 4 * 60 * 1000;
const GS_BASE = ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite"];

async function size(p: string) {
  return (await stat(p)).size;
}

/** Ghostscript presets: /screen 72 dpi, /ebook 150 dpi, /printer 300 dpi. Keeps the original if it was already smaller. */
export const compressPdf: ServerTool = async ({ job, dir, inputs, progress }) => {
  const level = ["screen", "ebook", "printer"].includes(String(job.options.level)) ? String(job.options.level) : "ebook";
  const outputs: ToolOutput[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const out = join(dir, `compressed-${i}.pdf`);
    await run(BIN.gs, [...GS_BASE, `-dPDFSETTINGS=/${level}`, "-dCompatibilityLevel=1.5", "-dDetectDuplicateImages=true", "-dCompressFonts=true", "-dSubsetFonts=true", `-sOutputFile=${out}`, inputs[i]], { cwd: dir, timeoutMs: TIMEOUT });
    const smaller = (await size(out)) < (await size(inputs[i]));
    outputs.push({ path: smaller ? out : inputs[i], name: `${base(job.files[i].name)}-compressed.pdf`, type: "application/pdf" });
    progress((i + 1) / inputs.length);
  }
  return outputs;
};

/** Rewrite a damaged file: qpdf first (keeps everything it can), Ghostscript as the heavier fallback. */
export const repairPdf: ServerTool = async ({ job, dir, inputs }) => {
  const out = join(dir, "repaired.pdf");
  try {
    // qpdf exits 3 on warnings (recovered file); that's the success case for a repair.
    await run(BIN.qpdf, ["--warning-exit-0", "--object-streams=generate", inputs[0], out], { cwd: dir, timeoutMs: TIMEOUT, okCodes: [0, 3] });
    await run(BIN.qpdf, ["--check", out], { cwd: dir, timeoutMs: TIMEOUT, okCodes: [0, 3] });
  } catch {
    try {
      await run(BIN.gs, [...GS_BASE, `-sOutputFile=${out}`, inputs[0]], { cwd: dir, timeoutMs: TIMEOUT });
    } catch {
      throw new ToolError("unrepairable");
    }
  }
  return [{ path: out, name: `${base(job.files[0].name)}-repaired.pdf`, type: "application/pdf" }];
};

/** Where Ghostscript keeps its sRGB profile: compiled-in ROM (upstream builds) or a file (Debian/Ubuntu packages). */
const ICC_CANDIDATES = ["%rom%iccprofiles/srgb.icc", "/usr/share/color/icc/ghostscript/srgb.icc", "/usr/share/ghostscript/iccprofiles/srgb.icc"];

/** PDF/A-2b with an sRGB output intent; a small PostScript prologue carries the metadata. */
export const pdfToPdfa: ServerTool = async ({ job, dir, inputs }) => {
  const out = join(dir, "pdfa.pdf");
  let lastError: unknown;
  for (const icc of ICC_CANDIDATES) {
    if (!icc.startsWith("%rom%")) {
      try { await stat(icc); } catch { continue; }
    }
    const def = join(dir, "pdfa_def.ps");
    await writeFile(def, `%!
[ /Title (${base(job.files[0].name).replace(/[()\\]/g, "")}) /DOCINFO pdfmark
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} << /N 3 >> /PUT pdfmark
[{icc_PDFA} (${icc}) (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} << /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {icc_PDFA} /OutputConditionIdentifier (sRGB) >> /PUT pdfmark
[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
`);
    const permit = icc.startsWith("%rom%") ? [] : [`--permit-file-read=${icc}`];
    try {
      await run(BIN.gs, [...permit, ...GS_BASE, "-dPDFA=2", "-dPDFACompatibilityPolicy=1", "-sColorConversionStrategy=RGB", "-sOutputICCProfile=srgb.icc", "-dEmbedAllFonts=true", "-dSubsetFonts=true", `-sOutputFile=${out}`, def, inputs[0]], { cwd: dir, timeoutMs: TIMEOUT });
      return [{ path: out, name: `${base(job.files[0].name)}-pdfa.pdf`, type: "application/pdf" }];
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof ToolError ? lastError : new ToolError("failed", "PDF/A conversion failed");
};
