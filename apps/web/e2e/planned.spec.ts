import { test, expect } from "@playwright/test";

/** Planned tools (README "Future plans") have pages and forms but no engine: they must never start a job. */

test("planned tools stay out of the sitemap and are noindex", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/stamp-maker");
  for (const id of ["convert-video", "video-to-audio", "audio-to-video", "shorten-url", "social-download"]) expect(xml).not.toContain(`/${id}`);
  const html = await (await request.get("/en/convert-video")).text();
  expect(html).toMatch(/<meta name="robots" content="noindex/);
});

test("home page marks planned tools as coming soon in their own groups", async ({ page }) => {
  await page.goto("/en");
  const media = page.locator("#media");
  await expect(media.getByRole("heading", { name: "Video and audio" })).toBeVisible();
  await expect(media.getByText("Coming soon")).toHaveCount(3);
  await expect(page.locator("#web").getByText("Coming soon")).toHaveCount(2);
  // The lede counts working tools only.
  await expect(page.getByText(/^49 tools/)).toBeVisible();
});

test("convert video: options appear for a dropped file, running reports the roadmap", async ({ page }) => {
  await page.goto("/en/convert-video");
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  await expect(page.getByText("Choose files or drop them here")).toBeVisible();
  await expect(page.getByText("Up to 5 files · 500 MB each")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(1024) }]);
  await expect(page.getByTestId("planned-note")).toBeVisible();
  await page.getByRole("button", { name: "Animated GIF" }).click();
  await expect(page.getByLabel("Frames per second")).toBeVisible();
  await expect(page.getByText("Remove the audio track")).toHaveCount(0);
  await page.getByRole("button", { name: "WebM" }).click();
  await expect(page.getByText("Remove the audio track")).toBeVisible();
  const run = page.getByTestId("run");
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByRole("alert").filter({ hasText: "Not available yet" })).toBeVisible();
});

test("MP4 to MP3: trim times are validated", async ({ page }) => {
  await page.goto("/video-to-audio");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "clip.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(1024) }]);
  await page.getByText("استخراج جزء من الفيديو فقط").click();
  await page.getByRole("textbox", { name: "من" }).fill("abc");
  await expect(page.getByTestId("run")).toBeDisabled();
  await page.getByRole("textbox", { name: "من" }).fill("0:30");
  await expect(page.getByTestId("run")).toBeEnabled();
});

test("URL shortener and social download: text tools with validation", async ({ page }) => {
  await page.goto("/en/shorten-url");
  await expect(page.getByTestId("planned-note")).toBeVisible();
  await expect(page.getByTestId("run")).toBeDisabled();
  await page.getByLabel("Long link").fill("https://example.com/some/long/path");
  await page.getByLabel("Custom name (optional)").fill("my link!");
  await expect(page.getByLabel("Custom name (optional)")).toHaveValue("mylink");
  await page.getByTestId("run").click();
  await expect(page.getByRole("alert").filter({ hasText: "Not available yet" })).toBeVisible();

  await page.goto("/en/social-download");
  await page.getByLabel("Post or video link").fill("https://www.tiktok.com/@someone/video/1");
  await expect(page.getByText("Detected: TikTok")).toBeVisible();
  await expect(page.getByTestId("run")).toBeDisabled();
  await page.getByText("This content is mine").click();
  await expect(page.getByTestId("run")).toBeEnabled();
});
