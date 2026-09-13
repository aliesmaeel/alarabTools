import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { expect, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** A small PDF with `pages` pages, each labelled. */
export async function pdfFixture(pages: number, label = "Page"): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`${label} ${i}`, { x: 40, y: 340, size: 24, font });
  }
  return Buffer.from(await doc.save());
}

/** 1×1 PNG. */
export const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

export async function pageCountOf(download: Download, password?: string): Promise<number> {
  const path = await download.path();
  const bytes = await readFile(path!);
  const doc = await PDFDocument.load(bytes, { password });
  return doc.getPageCount();
}

/** Open a tool page, upload files, and return once the options panel is visible. */
export async function openTool(page: Page, path: string, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.goto(path);
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await expect(page.getByRole("button", { name: /.+/ }).last()).toBeVisible();
}

/** Click the run button (the last big button in the options panel) and wait for the download. */
export async function runAndDownload(page: Page): Promise<Download> {
  const runButton = page.getByTestId("run");
  await expect(runButton).toBeEnabled();
  await runButton.click();
  const downloadButton = page.getByRole("button", { name: /Download result|تنزيل النتيجة/ });
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
  return download;
}
