import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFDict, PDFName, PDFRef } from "@cantoo/pdf-lib";
import { pdfFixture, runAndDownload } from "./fixtures";

/** BaseFont names used by a page. */
function fontsOf(doc: PDFDocument, pageIndex: number): string[] {
  const page = doc.getPage(pageIndex);
  const fonts = page.node.normalizedEntries().Font;
  const names: string[] = [];
  for (const [, ref] of fonts.entries()) {
    const dict = ref instanceof PDFRef ? doc.context.lookup(ref, PDFDict) : (ref as PDFDict);
    names.push(dict.get(PDFName.of("BaseFont"))?.toString() ?? "");
  }
  return names;
}

test("edit PDF: Arabic text on page 1, a rectangle on page 2", async ({ page }) => {
  const pdf = await pdfFixture(2);
  await page.goto("/en/edit-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "doc.pdf", mimeType: "application/pdf", buffer: pdf }]);
  const preview = page.getByTestId("page-preview");
  await expect(preview.locator("img").first()).toBeVisible();

  // Text tool: click on the page, then type.
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await preview.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await expect(page.getByTestId("edit-item")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Text" }).fill("مرحبا بكم");

  // Page 2: drag a rectangle.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("edit-item")).toHaveCount(1);
  await expect(page.getByText("2 changes")).toBeVisible();

  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("doc-edited.pdf");
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(doc.getPageCount()).toBe(2);
  expect(fontsOf(doc, 0).some((n) => /Tajawal/.test(n))).toBe(true);
  expect(fontsOf(doc, 1).some((n) => /Tajawal/.test(n))).toBe(false);
});
