import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runAndDownload } from "./fixtures";

async function samplePng(page: Page, w: number, h: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h]) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#3346b8"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f2c46b"; ctx.fillRect(w / 4, h / 4, w / 2, h / 2);
    return c.toDataURL("image/png");
  }, [w, h]);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

function pngSize(buf: Uint8Array): [number, number] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

test("crop: default 80% rectangle, then square preset", async ({ page }) => {
  await page.goto("/en");
  const png = await samplePng(page, 1000, 500);
  await page.goto("/en/crop-image");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "banner.png", mimeType: "image/png", buffer: png }]);
  await expect(page.getByTestId("crop-rect")).toBeVisible();

  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("banner-cropped.png");
  expect(pngSize(new Uint8Array(await readFile((await download.path())!)))).toEqual([800, 400]);

  // Square preset on a 2:1 image: height-limited to 80% -> 400x400
  await page.getByRole("button", { name: "Another file" }).click();
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "banner.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("radio", { name: "1:1" }).click();
  const square = await runAndDownload(page);
  expect(pngSize(new Uint8Array(await readFile((await square.path())!)))).toEqual([400, 400]);
});
