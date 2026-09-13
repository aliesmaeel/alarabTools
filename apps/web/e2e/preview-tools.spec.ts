import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { PDFDocument } from "@cantoo/pdf-lib";
import { pdfFixture, openTool, runAndDownload } from "./fixtures";

const PDF = "application/pdf";

test("PDF to JPG: one image per page in a ZIP", async ({ page }) => {
  await openTool(page, "/en/pdf-to-jpg", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(3) }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("images.zip");
  const zip = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(zip).sort()).toEqual(["doc-1.jpg", "doc-2.jpg", "doc-3.jpg"]);
  // JPEG magic bytes and a plausible 150 dpi size for a 300x400pt page (625x833 px)
  expect(zip["doc-1.jpg"][0]).toBe(0xff);
  expect(zip["doc-1.jpg"].length).toBeGreaterThan(5000);
});

test("PDF to PNG at 72 dpi for selected pages", async ({ page }) => {
  await openTool(page, "/pdf-to-jpg", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(4) }]);
  await page.getByText("PNG", { exact: true }).click();
  await page.getByText("عادية (72 نقطة/بوصة)").click();
  await page.getByPlaceholder("كل الصفحات").fill("2, 4");
  const download = await runAndDownload(page);
  const zip = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(zip).sort()).toEqual(["doc-2.png", "doc-4.png"]);
});

test("organize: remove page 2, rotate page 1, move page 3 first", async ({ page }) => {
  await openTool(page, "/en/organize-pdf", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(3) }]);
  await expect(page.getByAltText("Page 3")).toBeVisible({ timeout: 15_000 });
  const cards = page.locator("ol > li");
  await cards.nth(1).getByRole("button", { name: "Remove page" }).click();
  await cards.nth(0).getByRole("button", { name: "Rotate" }).click();
  await cards.nth(2).getByRole("button", { name: "Move back" }).click();
  await cards.nth(1).getByRole("button", { name: "Move back" }).click();
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("doc-organized.pdf");
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(doc.getPageCount()).toBe(2);
  // Order is now [page 3, page 1]; page 1 was rotated 90°.
  expect(doc.getPage(0).getRotation().angle).toBe(0);
  expect(doc.getPage(1).getRotation().angle).toBe(90);
});
