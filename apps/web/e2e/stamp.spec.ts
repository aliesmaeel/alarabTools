import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { pdfFixture } from "./fixtures";

function hasImage(doc: PDFDocument, pageIndex: number): boolean {
  const xobjects = doc.getPage(pageIndex).node.Resources()?.lookup(PDFName.of("XObject"));
  return xobjects?.toString().includes("Im") ?? false;
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function download(page: Page, testId: string) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  return { name: d.suggestedFilename(), bytes: await readFile((await d.path())!) };
}

test("stamp: live preview, PNG and SVG downloads", async ({ page }) => {
  await page.goto("/en/stamp-maker");
  const preview = page.getByTestId("stamp-preview");
  // The example design renders as soon as the font loads.
  await expect(preview.locator("svg textPath")).toHaveCount(2, { timeout: 15_000 });
  await expect(preview.locator("svg")).toContainText("APPROVED");

  await page.getByLabel("Centre text").fill("PAID");
  await page.getByLabel("Top text").fill("شركة الأفق للمقاولات");
  await expect(preview.locator("svg")).toContainText("PAID");
  await expect(preview.locator("svg textPath").first()).toHaveAttribute("text-anchor", "middle");
  await expect(preview.locator("svg text").first()).toHaveAttribute("direction", "rtl");

  const png = await download(page, "export-png");
  expect(png.name).toBe("PAID.png");
  expect(pngSize(png.bytes)).toEqual({ width: 1200, height: 1200 });

  await page.getByRole("button", { name: "Oval" }).click();
  await page.getByTestId("stamp-worn").fill("40");
  const svg = await download(page, "export-svg");
  expect(svg.name).toBe("PAID.svg");
  const text = svg.bytes.toString("utf8");
  expect(text).toContain('viewBox="0 0 520 360"');
  expect(text).toContain("@font-face");
  expect(text).toContain('filter="url(#worn)"');
  expect(text).toContain("شركة الأفق للمقاولات");
});

test("stamp: Arabic site, place the stamp on page 2 of a PDF", async ({ page }) => {
  await page.goto("/stamp-maker");
  const preview = page.getByTestId("stamp-preview");
  await expect(preview.locator("svg")).toContainText("الإدارة العامة", { timeout: 15_000 });
  await page.getByRole("button", { name: "اليوم (هجري)" }).click();
  await expect(preview.locator("svg")).toContainText("هـ");

  await page.getByTestId("stamp-pdf").setInputFiles([{ name: "عقد.pdf", mimeType: "application/pdf", buffer: await pdfFixture(3) }]);
  await expect(page.getByText("صفحة 1 من 3")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByAltText("الختم الموضوع")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "التالية" }).click();
  await expect(page.getByText("صفحة 2 من 3")).toBeVisible();
  const box = (await page.getByTestId("page-preview").boundingBox())!;
  await page.getByTestId("page-preview").click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });

  const out = await download(page, "stamp-pdf-download");
  expect(out.name).toBe("عقد-stamped.pdf");
  const doc = await PDFDocument.load(out.bytes);
  expect(doc.getPageCount()).toBe(3);
  expect(hasImage(doc, 1)).toBe(true);
  expect(hasImage(doc, 0)).toBe(false);
  expect(hasImage(doc, 2)).toBe(false);
});
