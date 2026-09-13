import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { NoProviderError, chunkText, summarize as gatewaySummarize, translate as gatewayTranslate } from "@alarab/ai";
import { fixArabicText } from "@alarab/arabic";
import { ToolError } from "../exec";
import { docx } from "../office";
import { ocrPdf, pdfText } from "./ocr";
import { base, type ServerTool, type ToolContext, type ToolOutput } from "./index";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Text of the PDF, falling back to OCR for scans (which also needs a provider). */
async function textOf(ctx: ToolContext): Promise<string> {
  const raw = await pdfText(ctx.inputs[0], ctx.dir);
  if (raw.trim().length >= 40) return fixArabicText(raw).text;
  const [, txt] = await ocrPdf({ ...ctx, progress: (f) => ctx.progress(f * 0.4) });
  return readFile(txt.path, "utf8");
}

function route(ctx: ToolContext) {
  return { region: ctx.job.region ?? "eu", source: ctx.job.source } as const;
}

function wrapProvider<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if (e instanceof NoProviderError) throw new ToolError("no-provider", e.tried.map((t) => `${t.id}: ${t.skipped}`).join("; "));
    throw e;
  });
}

async function outputs(ctx: ToolContext, suffix: string, text: string): Promise<ToolOutput[]> {
  const name = `${base(ctx.job.files[0].name)}-${suffix}`;
  const txt = join(ctx.dir, `${name}.txt`);
  const doc = join(ctx.dir, `${name}.docx`);
  await writeFile(txt, text);
  await writeFile(doc, docx(text.split(/\n+/).map((l) => l.trim()).filter(Boolean), "Arial"));
  return [{ path: doc, name: `${name}.docx`, type: DOCX }, { path: txt, name: `${name}.txt`, type: "text/plain" }];
}

/** Summaries are built chunk by chunk, then the chunk summaries are summarised once more. */
export const summarizePdf: ServerTool = async (ctx) => {
  const { job } = ctx;
  const lang: "ar" | "en" = job.options.language === "en" ? "en" : "ar";
  const length = String(job.options.length ?? "medium");
  const maxWords = length === "short" ? 120 : length === "long" ? 500 : 250;
  const text = await textOf(ctx);
  const chunks = chunkText(text, 6000);
  if (!chunks.length) throw new ToolError("no-text");
  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const { result } = await wrapProvider(gatewaySummarize({ text: chunks[i], lang, maxWords: chunks.length > 1 ? 200 : maxWords }, route(ctx)));
    partials.push(result);
    ctx.progress(0.4 + (0.5 * (i + 1)) / chunks.length);
  }
  let summary = partials.join("\n\n");
  if (partials.length > 1) {
    const { result } = await wrapProvider(gatewaySummarize({ text: summary, lang, maxWords }, route(ctx)));
    summary = result;
  }
  return outputs(ctx, lang === "ar" ? "ملخص" : "summary", summary);
};

/** Page-aware translation: each page's text is translated in chunks and pages are separated in the output. */
export const translatePdf: ServerTool = async (ctx) => {
  const { job } = ctx;
  const to: "ar" | "en" = job.options.to === "en" ? "en" : "ar";
  const from: "ar" | "en" | "auto" = job.options.from === "ar" || job.options.from === "en" ? job.options.from : "auto";
  const text = await textOf(ctx);
  const pages = text.split("\f").map((p) => p.trim()).filter(Boolean);
  if (!pages.length) throw new ToolError("no-text");
  const total = pages.reduce((n, p) => n + chunkText(p, 4000).length, 0);
  let done = 0;
  const outPages: string[] = [];
  for (const page of pages) {
    const parts: string[] = [];
    for (const chunk of chunkText(page, 4000)) {
      const { result } = await wrapProvider(gatewayTranslate({ text: chunk, from, to }, route(ctx)));
      parts.push(result);
      ctx.progress(0.4 + (0.6 * ++done) / total);
    }
    outPages.push(parts.join("\n"));
  }
  return outputs(ctx, to === "ar" ? "مترجم" : "translated", outPages.join("\n\n— — —\n\n"));
};
