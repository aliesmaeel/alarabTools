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
  "arabic-fonts",
  "organize-pdf",
  "pdf-to-jpg",
  "sign-pdf",
  "scan-to-pdf",
  "compare-pdf",
  "compress-image",
  "resize-image",
  "convert-to-jpg",
  "convert-from-jpg",
  "rotate-image",
  "crop-image",
  "watermark-image",
  "meme-generator",
  "blur-faces",
  "photo-editor",
  "edit-pdf",
]);

/** Tools that run in the image worker (WASM codecs) instead of the PDF worker. */
export const IMAGE_TOOLS = new Set(["compress-image", "resize-image", "convert-to-jpg", "convert-from-jpg", "rotate-image", "crop-image", "watermark-image", "meme-generator"]);

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
    case "arabic-fonts": return erase((await import("./text-options")).arabicFonts);
    case "organize-pdf": return erase((await import("./organize")).organizePdf);
    case "pdf-to-jpg": return erase((await import("./pdf-to-jpg")).pdfToJpg);
    case "sign-pdf": return erase((await import("./sign")).signPdf);
    case "scan-to-pdf": return erase((await import("./scan")).scanToPdf);
    case "compare-pdf": return erase((await import("./compare")).comparePdf);
    case "compress-image": return erase((await import("./image-options")).compressImage);
    case "resize-image": return erase((await import("./image-options")).resizeImage);
    case "convert-to-jpg": return erase((await import("./image-options")).convertToJpg);
    case "convert-from-jpg": return erase((await import("./image-options")).convertFromJpg);
    case "rotate-image": return erase((await import("./image-options")).rotateImage);
    case "crop-image": return erase((await import("./crop-image")).cropImage);
    case "watermark-image": return erase((await import("./image-text")).watermarkImage);
    case "meme-generator": return erase((await import("./image-text")).memeGenerator);
    case "blur-faces": return erase((await import("./blur-faces")).blurFaces);
    case "photo-editor": return erase((await import("./photo-editor")).photoEditor);
    case "edit-pdf": return erase((await import("./edit-pdf")).editPdf);
    default: return null;
  }
}
