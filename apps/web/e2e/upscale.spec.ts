import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runAndDownload } from "./fixtures";

async function samplePng(page: Page, w: number, h: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h]) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f2c46b"); g.addColorStop(1, "#3346b8");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff"; ctx.font = "bold 28px sans-serif"; ctx.fillText("عرب", 10, 40);
    return c.toDataURL("image/png");
  }, [w, h]);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

function pngSize(buf: Uint8Array): [number, number] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

test("upscale 2x with ESRGAN in the browser", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/en");
  const png = await samplePng(page, 120, 80);
  await page.goto("/en/upscale-image");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "tiny.png", mimeType: "image/png", buffer: png }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("tiny-x2.png");
  expect(pngSize(new Uint8Array(await readFile((await download.path())!)))).toEqual([240, 160]);
});
