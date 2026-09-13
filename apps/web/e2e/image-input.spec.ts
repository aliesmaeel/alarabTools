import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runAndDownload } from "./fixtures";

const FIX = join(__dirname, "fixtures");

/** Decode any image in the browser and return its size plus the mean per-pixel difference from `other` in two regions. */
async function analyse(page: Page, bytes: Buffer, mime: string, other?: Buffer, otherMime?: string) {
  return page.evaluate(async ([b64, mime, o64, omime]) => {
    const load = async (b: string, m: string) => {
      const arr = Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([arr], { type: m }));
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    };
    const a = await load(b64 as string, mime as string);
    if (!o64) return { width: a.width, height: a.height, face: 0, corner: 0 };
    const b = await load(o64 as string, omime as string);
    const mean = (x0: number, y0: number, x1: number, y1: number) => {
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * a.width + x) * 4;
        sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
        n++;
      }
      return sum / n / 3;
    };
    const W = a.width, H = a.height;
    return { width: W, height: H, face: mean(Math.round(W * 0.35), Math.round(H * 0.15), Math.round(W * 0.65), Math.round(H * 0.5)), corner: mean(0, Math.round(H * 0.8), Math.round(W * 0.2), H) };
  }, [bytes.toString("base64"), mime, other?.toString("base64") ?? "", otherMime ?? ""] as const);
}

test("HEIC input is decoded with libheif (convert to JPG)", async ({ page }) => {
  const heic = await readFile(join(FIX, "sample.heic"));
  await page.goto("/en/convert-to-jpg");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "IMG_0001.heic", mimeType: "image/heic", buffer: heic }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("IMG_0001.jpg");
  const out = await readFile((await download.path())!);
  expect(out[0]).toBe(0xff);
  const info = await analyse(page, out, "image/jpeg");
  expect([info.width, info.height]).toEqual([160, 100]);
});

test("blur faces: finds the one face in a portrait and leaves the rest alone", async ({ page }) => {
  test.setTimeout(90_000);
  const portrait = await readFile(join(FIX, "portrait.jpg"));
  await page.goto("/en/blur-faces");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("portrait-blurred.jpg");
  await expect(page.getByTestId("result-note")).toHaveText("1 face blurred.");
  const out = await readFile((await download.path())!);
  const diff = await analyse(page, out, "image/jpeg", portrait, "image/jpeg");
  expect([diff.width, diff.height]).toEqual([500, 644]);
  expect(diff.face).toBeGreaterThan(8);
  expect(diff.corner).toBeLessThan(4);
});
