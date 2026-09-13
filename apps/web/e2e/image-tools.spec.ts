import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { runAndDownload } from "./fixtures";

/** A noisy 800x600 photo-like PNG (incompressible enough to measure compression). */
async function samplePng(page: Page, w = 800, h = 600): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h]) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f2c46b"); g.addColorStop(1, "#3346b8");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 40; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }, [w, h]);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function upload(page: Page, path: string, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.goto(path);
  await page.locator('input[type="file"]').first().setInputFiles(files);
}

function pngSize(buf: Uint8Array): [number, number] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

test("compress: PNG in, smaller PNG out", async ({ page }) => {
  await page.goto("/en");
  const png = await samplePng(page);
  await upload(page, "/en/compress-image", [{ name: "photo.png", mimeType: "image/png", buffer: png }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("photo-compressed.png");
  const out = await readFile((await download.path())!);
  expect(out.subarray(1, 4).toString()).toBe("PNG");
  expect(out.length).toBeLessThan(png.length);
});

test("resize to 50% keeps the aspect ratio", async ({ page }) => {
  await page.goto("/en");
  const png = await samplePng(page, 800, 600);
  await upload(page, "/en/resize-image", [{ name: "a.png", mimeType: "image/png", buffer: png }, { name: "b.png", mimeType: "image/png", buffer: png }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("resized.zip");
  const zip = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(zip).sort()).toEqual(["a-400x300.png", "b-400x300.png"]);
  expect(pngSize(zip["a-400x300.png"])).toEqual([400, 300]);
});

test("convert to JPG then back to WebP", async ({ page }) => {
  await page.goto("/");
  const png = await samplePng(page, 200, 100);
  await upload(page, "/convert-to-jpg", [{ name: "شعار.png", mimeType: "image/png", buffer: png }]);
  const jpg = await runAndDownload(page);
  expect(jpg.suggestedFilename()).toBe("شعار.jpg");
  const jpgBytes = await readFile((await jpg.path())!);
  expect(jpgBytes[0]).toBe(0xff);

  await upload(page, "/convert-from-jpg", [{ name: "شعار.jpg", mimeType: "image/jpeg", buffer: jpgBytes }]);
  await page.getByText("WebP", { exact: true }).click();
  const webp = await runAndDownload(page);
  expect(webp.suggestedFilename()).toBe("شعار.webp");
  expect((await readFile((await webp.path())!)).subarray(8, 12).toString()).toBe("WEBP");
});

test("rotate image 90° swaps width and height", async ({ page }) => {
  await page.goto("/en");
  const png = await samplePng(page, 300, 120);
  await upload(page, "/en/rotate-image", [{ name: "wide.png", mimeType: "image/png", buffer: png }]);
  const download = await runAndDownload(page);
  expect(pngSize(new Uint8Array(await readFile((await download.path())!)))).toEqual([120, 300]);
});
