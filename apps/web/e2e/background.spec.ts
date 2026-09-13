import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runAndDownload } from "./fixtures";

/** Needs the worker with REMBG_BIN set (rembg + its model). */
test.skip(!process.env.SERVER_TOOLS, "server pipeline not running");
test.setTimeout(240_000);

test("remove background: corners become transparent, the face stays", async ({ page }) => {
  const portrait = await readFile(join(__dirname, "fixtures", "portrait.jpg"));
  await page.goto("/en/remove-background");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait }]);
  const download = await runAndDownload(page);
  expect(download.suggestedFilename()).toBe("portrait-no-bg.png");
  const out = await readFile((await download.path())!);
  const stats = await page.evaluate(async (b64) => {
    const arr = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([arr], { type: "image/png" }));
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const alpha = (x: number, y: number) => d[(y * c.width + x) * 4 + 3];
    return { w: c.width, h: c.height, corner: alpha(5, 5), corner2: alpha(c.width - 6, 5), face: alpha(Math.round(c.width / 2), Math.round(c.height * 0.3)) };
  }, out.toString("base64"));
  expect([stats.w, stats.h]).toEqual([500, 644]);
  expect(stats.corner).toBeLessThan(20);
  expect(stats.corner2).toBeLessThan(20);
  expect(stats.face).toBeGreaterThan(240);
});
