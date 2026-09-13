import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

const DOC = `# تقرير الربع الثالث

مقدمة **مهمة** عن النتائج، مع [رابط](https://example.com) و\`كود\`.

| البند | القيمة |
|---|---|
| الإيرادات | 1,200 |

- [x] مراجعة
- [ ] نشر

Plain English paragraph.
`;

test("open a .md file: Arabic preview, table, per-line direction", async ({ page }) => {
  await page.goto("/en/markdown-editor");
  const editor = page.getByTestId("markdown-editor");
  await expect(editor).toBeVisible();
  // Starts with the example, not an empty box.
  await expect(page.getByTestId("md-preview").locator("h1")).toHaveText("Markdown quick guide");

  await page.getByTestId("md-file").setInputFiles([{ name: "report.md", mimeType: "text/markdown", buffer: Buffer.from("﻿" + DOC, "utf8") }]);
  const preview = page.getByTestId("md-preview");
  await expect(preview.locator("h1")).toHaveText("تقرير الربع الثالث");
  await expect(page.getByText("report.md", { exact: true })).toBeVisible();
  await expect(preview.locator("table td").first()).toHaveText("الإيرادات");
  await expect(preview.locator("li.task input[checked]")).toHaveCount(1);
  await expect(preview.locator("a")).toHaveAttribute("rel", "noopener noreferrer");
  // Each block follows its own first letter.
  const dirs = await preview.locator("h1, p").evaluateAll((els) => els.map((e) => getComputedStyle(e).direction));
  expect(dirs[0]).toBe("rtl");
  expect(dirs[dirs.length - 1]).toBe("ltr");
});

test("exports: Word, HTML, .md and print to PDF", async ({ page }) => {
  await page.addInitScript(() => {
    // Headless Chrome has no print dialog; record the call instead.
    window.print = () => { (window.top as unknown as { __printed?: string }).__printed = document.title; };
  });
  await page.goto("/markdown-editor");
  await page.getByTestId("md-file").setInputFiles([{ name: "تقرير.md", mimeType: "text/markdown", buffer: Buffer.from(DOC, "utf8") }]);
  await expect(page.getByTestId("md-preview").locator("h1")).toHaveText("تقرير الربع الثالث");

  const [docx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-docx").click()]);
  expect(docx.suggestedFilename()).toBe("تقرير.docx");
  const files = unzipSync(await readFile((await docx.path())!));
  const xml = Buffer.from(files["word/document.xml"]).toString("utf8");
  expect(xml).toContain("تقرير الربع الثالث");
  expect(xml).toContain("<w:bidi/>");
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain("<w:hyperlink");
  expect(xml).toContain("☑");
  expect(Buffer.from(files["word/_rels/document.xml.rels"]).toString("utf8")).toContain("https://example.com");

  const [html] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-html").click()]);
  expect(html.suggestedFilename()).toBe("تقرير.html");
  const htmlText = (await readFile((await html.path())!)).toString("utf8");
  expect(htmlText).toContain('dir="rtl"');
  expect(htmlText).toContain("<table>");

  const [md] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-md").click()]);
  expect(md.suggestedFilename()).toBe("تقرير.md");
  expect((await readFile((await md.path())!)).toString("utf8")).toBe(DOC);

  await page.getByTestId("export-pdf").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed?: string }).__printed)).toBe("تقرير");
});

test("raw HTML and script links are not executed; the draft survives a reload", async ({ page }) => {
  await page.goto("/en/markdown-editor");
  const input = page.getByTestId("md-input");
  await input.fill('<img src=x onerror="window.__xss=1"> [click](javascript:alert(1))\n\n## Kept');
  const preview = page.getByTestId("md-preview");
  await expect(preview.locator("h2")).toHaveText("Kept");
  await expect(preview.locator("img")).toHaveCount(0);
  await expect(preview.locator("a")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId("md-preview").locator("h2")).toHaveText("Kept");
});

test("file names are not turned into links, and lists keep their markers", async ({ page }) => {
  await page.goto("/en/markdown-editor");
  await page.getByTestId("md-input").fill("Open notes.md, setup.py or www.example.com\n\n- one\n- two\n\n1. first\n2. second");
  const preview = page.getByTestId("md-preview");
  await expect(preview.locator("a")).toHaveCount(1);
  await expect(preview.locator("a")).toHaveText("www.example.com");
  expect(await preview.locator("ul").evaluate((e) => getComputedStyle(e).listStyleType)).toBe("disc");
  expect(await preview.locator("ol").evaluate((e) => getComputedStyle(e).listStyleType)).toBe("decimal");
});
