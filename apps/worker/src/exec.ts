import { spawn } from "node:child_process";

export class ToolError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export type ExecResult = { code: number; stdout: string; stderr: string };

/** Run a binary with a hard timeout; the process group is killed so LibreOffice's children go too. */
export function run(bin: string, args: string[], o: { cwd?: string; timeoutMs: number; env?: NodeJS.ProcessEnv; okCodes?: number[] } ): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: o.cwd, env: { ...process.env, ...o.env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { if (stdout.length < 200_000) stdout += d; });
    child.stderr.on("data", (d) => { if (stderr.length < 200_000) stderr += d; });
    const timer = setTimeout(() => {
      try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ }
      reject(new ToolError("timeout"));
    }, o.timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); reject(new ToolError("failed", e.message)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const ok = (o.okCodes ?? [0]).includes(code ?? -1);
      if (ok) resolve({ code: code ?? 0, stdout, stderr });
      else reject(new ToolError("failed", `${bin} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export const BIN = {
  gs: process.env.GS_BIN || "gs",
  qpdf: process.env.QPDF_BIN || "qpdf",
  soffice: process.env.SOFFICE_BIN || "libreoffice",
  pdftoppm: process.env.PDFTOPPM_BIN || "pdftoppm",
  pdftotext: process.env.PDFTOTEXT_BIN || "pdftotext",
};
