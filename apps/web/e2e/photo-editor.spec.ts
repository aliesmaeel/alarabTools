import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runAndDownload } from "./fixtures";

async function gradientPng(page: Page, w: number, h: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h]) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#ff0000"); g.addColorStop(1, "#0000ff");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    return c.toDataURL("image/png");
  }, [w, h]);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** Decode in the browser: size, how grey the middle row is, and how many frame-coloured edge pixels there are. */
async function inspect(page: Page, bytes: Buffer) {
  return page.evaluate(async (b64) => {
    const arr = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([arr], { type: "image/png" }));
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let chroma = 0, n = 0;
    const y = Math.floor(c.height / 2);
    for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; chroma += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); n++; }
    let white = 0;
    for (let x = 0; x < c.width; x++) { const i = x * 4; if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) white++; }
    return { width: c.width, height: c.height, chroma: chroma / n, whiteTopRow: white };
  }, bytes.toString("base64"));
}

test("photo editor: black & white preset, text layer and a white frame", async ({ page }) => {
  await page.goto("/en");
  const png = await gradientPng(page, 600, 400);
  await page.goto("/en/photo-editor");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "sunset.png", mimeType: "image/png", buffer: png }]);
  await expect(page.getByTestId("photo-canvas")).toBeVisible();

  await page.getByRole("radio", { name: "Black & white" }).click();
  await page.getByRole("tab", { name: "Text" }).click();
  await page.getByRole("button", { name: "Add text" }).click();
  await page.getByLabel("Text", { exact: true }).fill("مرحبا بالعالم");
  await expect(page.getByTestId("photo-layer")).toHaveCount(1);
  await page.getByRole("tab", { name: "Frame" }).click();
  await page.locator("#pe-frame-width").fill("5");

  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("sunset-edited.png");
  const info = await inspect(page, await readFile((await download.path())!));
  expect([info.width, info.height]).toEqual([600, 400]);
  expect(info.chroma).toBeLessThan(6); // grayscale: r, g and b agree
  expect(info.whiteTopRow).toBe(600); // frame covers the whole top row
});
