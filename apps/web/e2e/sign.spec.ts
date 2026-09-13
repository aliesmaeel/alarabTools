import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { pdfFixture, openTool, runAndDownload } from "./fixtures";

const PDF = "application/pdf";

function hasImage(doc: PDFDocument, pageIndex: number): boolean {
  const xobjects = doc.getPage(pageIndex).node.Resources()?.lookup(PDFName.of("XObject"));
  return xobjects?.toString().includes("Im") ?? false;
}

test("sign: draw a signature, place it on page 2 only", async ({ page }) => {
  await openTool(page, "/en/sign-pdf", [{ name: "contract.pdf", mimeType: PDF, buffer: await pdfFixture(3) }]);
  await expect(page.getByText("Page 1 of 3")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("run")).toBeDisabled();

  const pad = page.getByLabel("Signature drawing pad");
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 40, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 90, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByAltText("Signature preview")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  const preview = page.getByTestId("page-preview");
  const pb = (await preview.boundingBox())!;
  await preview.click({ position: { x: pb.width * 0.3, y: pb.height * 0.3 } });

  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("contract-signed.pdf");
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(doc.getPageCount()).toBe(3);
  expect(hasImage(doc, 1)).toBe(true);
  expect(hasImage(doc, 0)).toBe(false);
  expect(hasImage(doc, 2)).toBe(false);
});

test("sign: typed Arabic signature on every page", async ({ page }) => {
  await openTool(page, "/sign-pdf", [{ name: "عقد.pdf", mimeType: PDF, buffer: await pdfFixture(2) }]);
  await page.getByRole("tab", { name: "كتابة" }).click();
  await page.getByPlaceholder("اكتب اسمك").fill("علي إسماعيل");
  await expect(page.getByAltText("معاينة التوقيع")).toBeVisible({ timeout: 15_000 });
  await page.getByText("ضع التوقيع على كل الصفحات").click();
  const download = await runAndDownload(page);
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(hasImage(doc, 0)).toBe(true);
  expect(hasImage(doc, 1)).toBe(true);
});
