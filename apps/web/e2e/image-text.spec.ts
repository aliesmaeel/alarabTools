import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runAndDownload } from "./fixtures";

async function solidPng(page: Page, w: number, h: number, color: string): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h, color]) => {
    const c = document.createElement("canvas");
    c.width = Number(w); c.height = Number(h);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = String(color); ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }, [w, h, color] as const);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** Decode an image in the browser and count pixels that differ from `base` in three horizontal bands. */
async function changedPixels(page: Page, bytes: Buffer, mime: string, base: [number, number, number]) {
  return page.evaluate(async ([b64, mime, base]) => {
    const bin = atob(b64 as string);
    const arr = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([arr], { type: mime as string }));
    const c = document.createElement("canvas");
    c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const [br, bg, bb] = base as number[];
    const bands = [0, 0, 0];
    for (let y = 0; y < c.height; y++) {
      const band = Math.min(2, Math.floor((y / c.height) * 3));
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 30) bands[band]++;
      }
    }
    return { width: c.width, height: c.height, bands };
  }, [bytes.toString("base64"), mime, base] as const);
}

const BLUE: [number, number, number] = [0x33, 0x46, 0xb8];

test("watermark image: Arabic text in the bottom-right corner", async ({ page }) => {
  await page.goto("/en");
  const png = await solidPng(page, 600, 300, "#3346b8");
  await page.goto("/en/watermark-image");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "photo.png", mimeType: "image/png", buffer: png }]);
  await page.getByLabel("Watermark text").fill("سري للغاية");
  await page.getByText("In a corner", { exact: true }).click();
  await page.getByRole("button", { name: "Bottom right" }).click();
  await page.getByLabel("Angle in degrees").fill("0");
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("photo-watermarked.png");
  const out = await readFile((await download.path())!);
  const stats = await changedPixels(page, out, "image/png", BLUE);
  expect([stats.width, stats.height]).toEqual([600, 300]);
  expect(stats.bands[0]).toBe(0); // top band untouched
  expect(stats.bands[2]).toBeGreaterThan(200); // text drawn near the bottom
});

test("watermark image: logo tiled across two photos", async ({ page }) => {
  await page.goto("/en");
  const photo = await solidPng(page, 500, 400, "#3346b8");
  const logo = await solidPng(page, 100, 50, "#ff0000");
  await page.goto("/en/watermark-image");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "a.png", mimeType: "image/png", buffer: photo }, { name: "b.png", mimeType: "image/png", buffer: photo }]);
  await page.getByText("Image or logo", { exact: true }).click();
  await page.getByLabel("Image", { exact: true }).setInputFiles([{ name: "logo.png", mimeType: "image/png", buffer: logo }]);
  await page.getByText("Repeated across the image", { exact: true }).click();
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("watermarked.zip");
});

test("meme: captions at the top and bottom, middle untouched", async ({ page }) => {
  await page.goto("/");
  const png = await solidPng(page, 500, 500, "#3346b8");
  await page.goto("/meme-generator");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "cat.png", mimeType: "image/png", buffer: png }]);
  await page.getByLabel("النص العلوي").fill("لما يشتغل الكود");
  await page.getByLabel("النص السفلي").fill("من أول مرة");
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("cat-meme.png");
  const stats = await changedPixels(page, await readFile((await download.path())!), "image/png", BLUE);
  expect(stats.bands[0]).toBeGreaterThan(500);
  expect(stats.bands[1]).toBe(0);
  expect(stats.bands[2]).toBeGreaterThan(500);
});
