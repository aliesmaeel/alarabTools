import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { PDFDocument } from "@cantoo/pdf-lib";
import { pdfFixture, png, pageCountOf, openTool, runAndDownload } from "./fixtures";

const PDF = "application/pdf";

test("merge two PDFs in Arabic UI", async ({ page }) => {
  await openTool(page, "/merge-pdf", [
    { name: "a.pdf", mimeType: PDF, buffer: await pdfFixture(3, "A") },
    { name: "b.pdf", mimeType: PDF, buffer: await pdfFixture(2, "B") },
  ]);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("a-merged.pdf");
  expect(await pageCountOf(download)).toBe(5);
});

test("split into ranges produces a ZIP", async ({ page }) => {
  await openTool(page, "/en/split-pdf", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(6) }]);
  await page.getByPlaceholder("1-3; 4-6").fill("1-2; 3-6");
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("split.zip");
  const zip = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(zip).sort()).toEqual(["doc-1.pdf", "doc-2.pdf"]);
  expect((await PDFDocument.load(zip["doc-2.pdf"])).getPageCount()).toBe(4);
});

test("remove pages", async ({ page }) => {
  await openTool(page, "/en/remove-pages", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(5) }]);
  await page.getByPlaceholder("2, 5-7").fill("1, 3");
  expect(await pageCountOf(await runAndDownload(page))).toBe(3);
});

test("rotate all pages 90°", async ({ page }) => {
  await openTool(page, "/en/rotate-pdf", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(2) }]);
  const download = await runAndDownload(page);
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  expect(doc.getPage(0).getRotation().angle).toBe(90);
  expect(doc.getPage(1).getRotation().angle).toBe(90);
});

test("protect then unlock", async ({ page }) => {
  await openTool(page, "/en/protect-pdf", [{ name: "doc.pdf", mimeType: PDF, buffer: await pdfFixture(2) }]);
  await page.getByLabel("Password", { exact: true }).fill("hunter2");
  await page.getByLabel("Confirm password").fill("hunter2");
  const locked = await runAndDownload(page);
  const lockedBytes = await readFile((await locked.path())!);
  expect((await PDFDocument.load(lockedBytes, { ignoreEncryption: true })).isEncrypted).toBe(true);

  await openTool(page, "/en/unlock-pdf", [{ name: "locked.pdf", mimeType: PDF, buffer: lockedBytes }]);
  await page.getByLabel("File password").fill("hunter2");
  const unlocked = await runAndDownload(page);
  const doc = await PDFDocument.load(await readFile((await unlocked.path())!));
  expect(doc.isEncrypted).toBe(false);
  expect(doc.getPageCount()).toBe(2);
});

test("wrong password asks again instead of failing", async ({ page }) => {
  const doc = await PDFDocument.load(await pdfFixture(1));
  doc.encrypt({ userPassword: "right", ownerPassword: "right" });
  await openTool(page, "/en/rotate-pdf", [{ name: "locked.pdf", mimeType: PDF, buffer: Buffer.from(await doc.save()) }]);
  await page.getByTestId("run").click();
  await expect(page.getByText("This file is password protected")).toBeVisible();
});

test("images to PDF on A4", async ({ page }) => {
  await openTool(page, "/en/jpg-to-pdf", [
    { name: "one.png", mimeType: "image/png", buffer: png },
    { name: "two.png", mimeType: "image/png", buffer: png },
  ]);
  await page.getByText("A4 page").click();
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("images.pdf");
  expect(await pageCountOf(download)).toBe(2);
});
