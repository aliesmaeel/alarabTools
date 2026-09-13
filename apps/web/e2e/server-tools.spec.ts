import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, PDFName, StandardFonts } from "@cantoo/pdf-lib";
import { pageCountOf, pdfFixture, runAndDownload } from "./fixtures";

/**
 * These need the server pipeline: Redis + a running worker (with Ghostscript, qpdf, LibreOffice, poppler)
 * and a web app started with REDIS_URL. Run with SERVER_TOOLS=1; skipped otherwise.
 */
test.skip(!process.env.SERVER_TOOLS, "server pipeline not running");
test.setTimeout(180_000);

const FIX = join(__dirname, "fixtures");

/** A PDF holding a noisy 900×600 PNG (noise does not deflate), so Ghostscript's downsampling has something to shrink. */
async function heavyPdf(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900; c.height = 600;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(900, 600);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  });
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const img = await doc.embedPng(Buffer.from(dataUrl.split(",")[1], "base64"));
  const p = doc.addPage([595, 842]);
  p.drawImage(img, { x: 40, y: 300, width: 500, height: 333 });
  p.drawText("Heavy page", { x: 40, y: 700, size: 24, font });
  return Buffer.from(await doc.save());
}

test("compress PDF through the worker", async ({ page }) => {
  await page.goto("/en");
  const pdf = await heavyPdf(page);
  expect(pdf.length).toBeGreaterThan(500_000);
  await page.goto("/en/compress-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "heavy.pdf", mimeType: "application/pdf", buffer: pdf }]);
  await page.getByText("Smallest", { exact: true }).click();
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("heavy-compressed.pdf");
  const out = await readFile((await download.path())!);
  expect(out.length).toBeLessThan(pdf.length / 2);
  expect(await pageCountOf(download)).toBe(1);
});

test("Word to PDF through LibreOffice", async ({ page }) => {
  const docx = await readFile(join(FIX, "sample.docx"));
  await page.goto("/en/word-to-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "عقد.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("عقد.pdf");
  expect(await pageCountOf(download)).toBeGreaterThanOrEqual(1);
});

test("redact PDF rasterises the marked page only", async ({ page }) => {
  const pdf = await pdfFixture(2);
  await page.goto("/en/redact-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "doc.pdf", mimeType: "application/pdf", buffer: pdf }]);
  const preview = page.getByTestId("page-preview");
  await expect(preview.locator("img").first()).toBeVisible();
  const box = (await preview.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("redact-box")).toHaveCount(1);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("doc-redacted.pdf");
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(doc.getPageCount()).toBe(2);
  // Page 1 is now an image (no fonts); page 2 still has its Helvetica text.
  const fonts = (i: number) => doc.getPage(i).node.normalizedEntries().Font.entries().length;
  expect(fonts(0)).toBe(0);
  expect(fonts(1)).toBe(1);
});

test("PDF/A conversion carries an output intent", async ({ page }) => {
  const pdf = await pdfFixture(1);
  await page.goto("/en/pdf-to-pdfa");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "doc.pdf", mimeType: "application/pdf", buffer: pdf }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("doc-pdfa.pdf");
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(doc.catalog.has(PDFName.of("OutputIntents"))).toBe(true);
});
