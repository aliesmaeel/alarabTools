import type { JobRecord } from "@alarab/jobs";

export type ToolContext = {
  job: JobRecord;
  /** Job-private working directory (deleted afterwards). */
  dir: string;
  /** Local paths of the downloaded inputs, in order. */
  inputs: string[];
  progress: (fraction: number) => void;
};

export type ToolOutput = { path: string; name: string; type: string };

/** Every server tool takes downloaded inputs and returns one output file (several are zipped by the runner). */
export type ServerTool = (ctx: ToolContext) => Promise<ToolOutput[]>;

export async function loadTool(id: string): Promise<ServerTool | null> {
  switch (id) {
    case "compress-pdf": return (await import("./ghostscript")).compressPdf;
    case "repair-pdf": return (await import("./ghostscript")).repairPdf;
    case "pdf-to-pdfa": return (await import("./ghostscript")).pdfToPdfa;
    case "word-to-pdf":
    case "excel-to-pdf":
    case "powerpoint-to-pdf": return (await import("./office")).officeToPdf;
    case "html-to-pdf": return (await import("./html")).htmlToPdf;
    case "html-to-image": return (await import("./html")).htmlToImage;
    case "redact-pdf": return (await import("./redact")).redactPdf;
    default: return null;
  }
}

export const base = (name: string) => name.replace(/\.[^.]+$/, "");
