import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { pdfFixture, png, runAndDownload } from "./fixtures";

test("arabic fonts: typed text to PDF, Kufi font, one page sized to the text", async ({ page }) => {
  await page.goto("/arabic-fonts");
  const textarea = page.getByPlaceholder("اكتب هنا…");
  await expect(textarea).toBeVisible();
  await textarea.fill("بسم الله الرحمن الرحيم");
  await page.getByLabel("الخط").selectOption("reem-kufi");
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("arabic-text.pdf");
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(doc.getPageCount()).toBe(1);
  const { width, height } = doc.getPage(0).getSize();
  expect(width).toBeGreaterThan(height);
});

test("arabic fonts: PNG output", async ({ page }) => {
  await page.goto("/en/arabic-fonts");
  await page.getByPlaceholder("Type here…").fill("مرحبا World");
  await page.getByText("PNG with transparent background").click();
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("arabic-text.png");
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.length).toBeGreaterThan(500);
});

test("watermark: image logo on every page", async ({ page }) => {
  await page.goto("/en/add-watermark");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "doc.pdf", mimeType: "application/pdf", buffer: await pdfFixture(2) }]);
  await page.getByText("Image or logo").click();
  await page.getByLabel("Image", { exact: true }).setInputFiles([{ name: "logo.png", mimeType: "image/png", buffer: png }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("doc-watermarked.pdf");
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  for (const p of doc.getPages()) {
    const xobjects = p.node.Resources()?.lookup(PDFName.of("XObject"));
    expect(xobjects?.toString()).toContain("Im");
  }
});
