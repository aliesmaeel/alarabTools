import { join } from "node:path";
import { readdir, mkdir } from "node:fs/promises";
import { BIN, run, ToolError } from "../exec";
import { base, type ServerTool, type ToolOutput } from "./index";

/**
 * LibreOffice headless. Each job gets a throwaway profile (-env:UserInstallation) so runs never
 * share state, and macros never execute because nothing enables them in a fresh profile.
 */
export const officeToPdf: ServerTool = async ({ job, dir, inputs, progress }) => {
  const profile = join(dir, "lo-profile");
  await mkdir(profile, { recursive: true });
  const outDir = join(dir, "out");
  await mkdir(outDir, { recursive: true });
  const outputs: ToolOutput[] = [];
  for (let i = 0; i < inputs.length; i++) {
    await run(BIN.soffice, [`-env:UserInstallation=file://${profile}`, "--headless", "--norestore", "--nologo", "--convert-to", "pdf:writer_pdf_Export", "--outdir", outDir, inputs[i]], { cwd: dir, timeoutMs: 4 * 60 * 1000 });
    const produced = (await readdir(outDir)).find((f) => f.startsWith(base(inputs[i].split("/").pop()!)) && f.endsWith(".pdf"));
    if (!produced) throw new ToolError("failed", "LibreOffice produced no PDF");
    outputs.push({ path: join(outDir, produced), name: `${base(job.files[i].name)}.pdf`, type: "application/pdf" });
    progress((i + 1) / inputs.length);
  }
  return outputs;
};
