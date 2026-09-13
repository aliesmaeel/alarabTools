import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "@cantoo/pdf-lib";
import { unzipSync } from "fflate";
import { runAndDownload } from "./fixtures";

/** Needs the server pipeline, the worker, and AI_MOCK=1 on both (see .env.local / apps/worker/.env). */
test.skip(!process.env.SERVER_TOOLS, "server pipeline not running");
test.setTimeout(180_000);

const FIX = join(__dirname, "fixtures");

/** Enable the mock provider through the admin API so the gateway has something to route to. */
async function enableMock(request: APIRequestContext) {
  const login = await request.post("/api/jobs", { data: {} }); // warms the base URL
  void login;
  const res = await request.post("/api/admin/login", { data: { password: "local-admin-pass" } });
  expect(res.ok()).toBe(true);
  await request.put("/api/admin/providers", { data: { provider: "mock", action: "set-fields", fields: { apiKey: "mock-key" } } });
  await request.put("/api/admin/providers", { data: { provider: "mock", action: "enable" } });
  await request.put("/api/admin/routing", { data: { routing: { ocr: ["mock"], translate: ["mock"], summarize: ["mock"] } } });
}

test("OCR PDF: scanned page gets a searchable text layer", async ({ page, request }) => {
  await enableMock(request);
  // An image-only PDF (a "scan").
  const doc = await PDFDocument.create();
  const png = await readFile(join(FIX, "portrait.jpg"));
  const img = await doc.embedJpg(png);
  const p = doc.addPage([500, 644]);
  p.drawImage(img, { x: 0, y: 0, width: 500, height: 644 });
  const scan = Buffer.from(await doc.save());

  await page.goto("/en/ocr-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "scan.pdf", mimeType: "application/pdf", buffer: scan }]);
  await expect(page.getByText(/sends the file's content to an AI provider/)).toBeVisible();
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("ocr-pdf.zip");
  const zip = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(zip).sort()).toEqual(["scan-searchable.pdf", "scan.txt"]);
  expect(Buffer.from(zip["scan.txt"]).toString("utf8")).toContain("MOCK");
  const out = await PDFDocument.load(zip["scan-searchable.pdf"]);
  expect(out.getPageCount()).toBe(1);
  // The page now carries fonts (the invisible text layer).
  expect(out.getPage(0).node.normalizedEntries().Font.entries().length).toBeGreaterThan(0);
});

test("PDF to Word keeps Arabic readable and un-flips numbers", async ({ page }) => {
  const pdf = await readFile(join(FIX, "arabic.pdf"));
  await page.goto("/pdf-to-word");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "فاتورة.pdf", mimeType: "application/pdf", buffer: pdf }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("فاتورة.docx");
  const files = unzipSync(await readFile((await download.path())!));
  const xml = Buffer.from(files["word/document.xml"]).toString("utf8");
  expect(xml).toContain("الفاتورة");
  expect(xml).toContain("12345");
  expect(xml).not.toContain("54321");
});

test("fix Arabic text: reversed lines in a .txt", async ({ page }) => {
  const txt = Buffer.from("ةكرشلا ريدم ىلإ باتكلا اذه\nعام 6202 ميلادي\n", "utf8");
  await page.goto("/en/fix-arabic-text");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "notes.txt", mimeType: "text/plain", buffer: txt }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("notes-fixed.txt");
  const out = (await readFile((await download.path())!)).toString("utf8");
  expect(out).toContain("هذا الكتاب إلى مدير الشركة");
  expect(out).toContain("عام 2026 ميلادي");
});

test("PDF to Excel splits layout columns into cells", async ({ page }) => {
  const pdf = await readFile(join(FIX, "arabic.pdf"));
  await page.goto("/en/pdf-to-excel");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "table.pdf", mimeType: "application/pdf", buffer: pdf }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("table.xlsx");
  const files = unzipSync(await readFile((await download.path())!));
  const sheet = Buffer.from(files["xl/worksheets/sheet1.xml"]).toString("utf8");
  expect(sheet).toContain("<row r=\"1\">");
  expect(sheet).toContain("ريال");
});
