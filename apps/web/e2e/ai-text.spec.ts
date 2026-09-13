import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { runAndDownload } from "./fixtures";

test.skip(!process.env.SERVER_TOOLS, "server pipeline not running");
test.setTimeout(180_000);
const FIX = join(__dirname, "fixtures");

async function enableMock(request: APIRequestContext) {
  const res = await request.post("/api/admin/login", { data: { password: "local-admin-pass" } });
  expect(res.ok()).toBe(true);
  await request.put("/api/admin/providers", { data: { provider: "mock", action: "set-fields", fields: { apiKey: "mock-key" } } });
  await request.put("/api/admin/providers", { data: { provider: "mock", action: "enable" } });
  await request.put("/api/admin/routing", { data: { routing: { ocr: ["mock"], translate: ["mock"], summarize: ["mock"] } } });
}

test("summarize PDF in Arabic", async ({ page, request }) => {
  await enableMock(request);
  await page.goto("/summarize-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "تقرير.pdf", mimeType: "application/pdf", buffer: await readFile(join(FIX, "arabic.pdf")) }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("summarize-pdf.zip");
  const zip = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(zip).sort()).toEqual(["تقرير-ملخص.docx", "تقرير-ملخص.txt"]);
  expect(Buffer.from(zip["تقرير-ملخص.txt"]).toString("utf8")).toContain("ملخص تجريبي");
});

test("translate PDF into English", async ({ page, request }) => {
  await enableMock(request);
  await page.goto("/en/translate-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "letter.pdf", mimeType: "application/pdf", buffer: await readFile(join(FIX, "arabic.pdf")) }]);
  await page.getByText("Into English", { exact: true }).click();
  const download = await runAndDownload(page);
  const zip = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(zip).sort()).toEqual(["letter-translated.docx", "letter-translated.txt"]);
  expect(Buffer.from(zip["letter-translated.txt"]).toString("utf8")).toContain("[translation]");
});

test("summarize refuses when no provider is available", async ({ page, request }) => {
  await enableMock(request);
  await request.put("/api/admin/providers", { data: { provider: "mock", action: "disable" } });
  await page.goto("/en/summarize-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "x.pdf", mimeType: "application/pdf", buffer: await readFile(join(FIX, "arabic.pdf")) }]);
  await page.getByTestId("run").click();
  await expect(page.getByText("No AI provider is available", { exact: false })).toBeVisible({ timeout: 60_000 });
  await request.put("/api/admin/providers", { data: { provider: "mock", action: "enable" } });
});
