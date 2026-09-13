import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pdfFixture, openTool, runAndDownload } from "./fixtures";

const PDF = "application/pdf";

/** Text of every page, via pdf.js (checks the ToUnicode map our subset fonts write). */
async function extractText(path: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages;
}

test("page numbers: Western digits by default on the English site", async ({ page }) => {
  await openTool(page, "/en/add-page-numbers", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(3) }]);
  await page.getByText("Page 1 of 10").click();
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("doc-numbered.pdf");
  const pages = await extractText((await download.path())!);
  expect(pages[2]).toContain("Page 3 of 3");
});

test("page numbers: Arabic-Indic digits by default on the Arabic site", async ({ page }) => {
  await openTool(page, "/add-page-numbers", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(2) }]);
  const download = await runAndDownload(page);
  const pages = await extractText((await download.path())!);
  expect(pages[1]).toContain("٢");
});

test("watermark text is embedded on every page", async ({ page }) => {
  await openTool(page, "/en/add-watermark", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(2) }]);
  await page.getByPlaceholder("e.g. CONFIDENTIAL, DRAFT, your company").fill("CONFIDENTIAL");
  const download = await runAndDownload(page);
  const pages = await extractText((await download.path())!);
  expect(pages[0]).toContain("CONFIDENTIAL");
  expect(pages[1]).toContain("CONFIDENTIAL");
});

test("hijri stamp: 12 Sept 2026 is 1 Rabi' II 1448, first page only", async ({ page }) => {
  await openTool(page, "/en/hijri-date-stamp", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(2) }]);
  await page.getByLabel("Date", { exact: true }).fill("2026-09-12");
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("doc-dated.pdf");
  const pages = await extractText((await download.path())!);
  expect(pages[0]).toContain("1 Rabi' II 1448 AH");
  expect(pages[0]).toContain("12 September 2026");
  expect(pages[1]).not.toContain("1448");
});
