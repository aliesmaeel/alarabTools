import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "@cantoo/pdf-lib";
import { pdfFixture, openTool, runAndDownload } from "./fixtures";

const PDF = "application/pdf";

/** A 64x64 JPEG-ish PNG with a dark square on light background, drawn in the browser. */
async function photo(page: import("@playwright/test").Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400; c.height = 300;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#d9d2c0"; ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = "#333"; ctx.font = "40px sans-serif"; ctx.fillText("Receipt 42", 40, 150);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test("scan to PDF: two photos become a two-page A4 document", async ({ page }) => {
  await page.goto("/en/scan-to-pdf");
  const img = await photo(page);
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "IMG_0001.png", mimeType: "image/png", buffer: img },
    { name: "IMG_0002.png", mimeType: "image/png", buffer: img },
  ]);
  await page.getByText("Black and white (document)").click();
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("scan.pdf");
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(doc.getPageCount()).toBe(2);
  // Landscape photo -> landscape A4
  const { width, height } = doc.getPage(0).getSize();
  expect([Math.round(width), Math.round(height)]).toEqual([842, 595]);
});

test("compare: page 2 differs, page 1 is identical", async ({ page }) => {
  const a = await pdfFixture(2, "Version");
  const bDoc = await PDFDocument.load(await pdfFixture(2, "Version"));
  bDoc.getPage(1).drawRectangle({ x: 50, y: 50, width: 200, height: 100 });
  const b = Buffer.from(await bDoc.save());
  await openTool(page, "/en/compare-pdf", [
    { name: "v1.pdf", mimeType: PDF, buffer: a },
    { name: "v2.pdf", mimeType: PDF, buffer: b },
  ]);
  await expect(page.getByTestId("diff-summary")).toHaveText("The pages are identical", { timeout: 20_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("diff-summary")).toContainText("% of the page differs", { timeout: 20_000 });
  await page.getByRole("button", { name: "Check all pages" }).click();
  await expect(page.getByTestId("changed-pages")).toHaveText("Pages that differ: 2", { timeout: 20_000 });
});
