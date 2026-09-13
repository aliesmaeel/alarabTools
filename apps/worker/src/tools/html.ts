import { join } from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ToolError } from "../exec";
import type { ServerTool } from "./index";

/** Reject private and loopback targets so the worker can't be used to reach internal services. */
async function assertPublic(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ToolError("bad-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ToolError("bad-url");
  const host = url.hostname;
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new ToolError("bad-url");
  for (const { address } of addrs) {
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address) || address === "::1" || /^f[cd]/i.test(address) || /^fe80/i.test(address) || address === "::") throw new ToolError("bad-url");
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new ToolError("bad-url");
  return url;
}

async function withPage<T>(fn: (page: import("playwright-core").Page) => Promise<T>): Promise<T> {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.CHROME_CHANNEL || "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar", deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export const htmlToPdf: ServerTool = async ({ job, dir }) => {
  const url = await assertPublic(String(job.options.url ?? ""));
  const out = join(dir, "page.pdf");
  await withPage(async (page) => {
    await page.goto(url.href, { waitUntil: "networkidle", timeout: 45_000 }).catch(async () => page.goto(url.href, { waitUntil: "domcontentloaded" }));
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
  });
  return [{ path: out, name: `${url.hostname}.pdf`, type: "application/pdf" }];
};

export const htmlToImage: ServerTool = async ({ job, dir }) => {
  const url = await assertPublic(String(job.options.url ?? ""));
  const out = join(dir, "page.png");
  await withPage(async (page) => {
    await page.goto(url.href, { waitUntil: "networkidle", timeout: 45_000 }).catch(async () => page.goto(url.href, { waitUntil: "domcontentloaded" }));
    await page.screenshot({ path: out, fullPage: true });
  });
  return [{ path: out, name: `${url.hostname}.png`, type: "image/png" }];
};
