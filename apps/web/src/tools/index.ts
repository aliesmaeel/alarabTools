import type { ToolModule, Options } from "./types";

// Erases the per-tool options type; the runner treats options as an opaque record.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const erase = (m: ToolModule<any>) => m as ToolModule<Options>;

/** Tools with a working browser engine. Anything not listed shows the "coming soon" drop zone. */
export const IMPLEMENTED = new Set([
  "merge-pdf",
  "split-pdf",
  "remove-pages",
  "extract-pages",
  "rotate-pdf",
  "crop-pdf",
  "protect-pdf",
  "unlock-pdf",
  "jpg-to-pdf",
  "add-page-numbers",
  "add-watermark",
  "hijri-date-stamp",
]);

// Lazy so a tool page only ships its own form.
export async function loadToolModule(id: string): Promise<ToolModule | null> {
  switch (id) {
    case "merge-pdf": return erase((await import("./pdf-options")).mergePdf);
    case "split-pdf": return erase((await import("./pdf-options")).splitPdf);
    case "remove-pages": return erase((await import("./pdf-options")).removePages);
    case "extract-pages": return erase((await import("./pdf-options")).extractPages);
    case "rotate-pdf": return erase((await import("./pdf-options")).rotatePdf);
    case "crop-pdf": return erase((await import("./pdf-options")).cropPdf);
    case "protect-pdf": return erase((await import("./pdf-options")).protectPdf);
    case "unlock-pdf": return erase((await import("./pdf-options")).unlockPdf);
    case "jpg-to-pdf": return erase((await import("./pdf-options")).jpgToPdf);
    case "add-page-numbers": return erase((await import("./text-options")).addPageNumbers);
    case "add-watermark": return erase((await import("./text-options")).addWatermark);
    case "hijri-date-stamp": return erase((await import("./text-options")).hijriDateStamp);
    default: return null;
  }
}
