"use client";

import { useTranslations } from "next-intl";
import { parsePageRanges } from "@alarab/pdf-core/pages";
import type { OptionsProps, ToolModule } from "./types";
import type { Output, RunResult } from "@/workers/pdf.worker";
import { Field, RadioGroup, TextInput } from "./fields";
import { canvasToBlob, openPdf, renderPage, PdfPasswordError } from "@/lib/pdfjs";

type O = { format: "jpg" | "png"; dpi: "72" | "150" | "300"; pages: string; password?: string };

function Options({ value, onChange, pageCount }: OptionsProps<O>) {
  const t = useTranslations("options");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup name="img-format" value={value.format} onChange={(format) => onChange({ ...value, format })} options={[{ value: "jpg", label: "JPG", hint: t("pdfToJpg.jpgHint") }, { value: "png", label: "PNG", hint: t("pdfToJpg.pngHint") }]} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("pdfToJpg.quality")}</span>
        <RadioGroup name="dpi" value={value.dpi} onChange={(dpi) => onChange({ ...value, dpi })} options={[{ value: "72", label: t("pdfToJpg.dpi72") }, { value: "150", label: t("pdfToJpg.dpi150") }, { value: "300", label: t("pdfToJpg.dpi300") }]} />
      </div>
      <Field label={t("pagesOptional")} hint={t("pagesExample", { count: pageCount ?? 10 })}>
        {(id) => <TextInput id={id} dir="ltr" value={value.pages} placeholder={t("rotate.allPages")} onChange={(e) => onChange({ ...value, pages: e.target.value })} />}
      </Field>
    </div>
  );
}

/** Renders on the main thread with pdf.js (which has its own worker); canvases can't live in our worker on every browser. */
async function run(files: File[], o: O, onProgress: (done: number, total: number) => void): Promise<RunResult> {
  try {
    const outputs: Output[] = [];
    const scale = Number(o.dpi) / 72;
    const type = o.format === "png" ? "image/png" : "image/jpeg";
    let total = 0;
    const jobs: { file: File; pages: number[] }[] = [];
    for (const file of files) {
      const { doc, close } = await openPdf(file, o.password);
      const indices = o.pages.trim() ? parsePageRanges(o.pages, doc.numPages) : Array.from({ length: doc.numPages }, (_, i) => i);
      jobs.push({ file, pages: indices });
      total += indices.length;
      await close();
    }
    let done = 0;
    for (const { file, pages } of jobs) {
      const { doc, close } = await openPdf(file, o.password);
      const base = file.name.replace(/\.[^.]+$/, "");
      for (const i of pages) {
        const canvas = await renderPage(doc, i + 1, { scale });
        const blob = await canvasToBlob(canvas, type, 0.9);
        canvas.width = 0;
        outputs.push({ name: `${base}-${i + 1}.${o.format}`, bytes: new Uint8Array(await blob.arrayBuffer()), mime: type });
        onProgress(++done, total);
      }
      await close();
    }
    return { ok: true, outputs };
  } catch (e) {
    if (e instanceof PdfPasswordError) return { ok: false, code: "password", message: "password" };
    return { ok: false, code: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export const pdfToJpg: ToolModule<O> = {
  defaults: { format: "jpg", dpi: "150", pages: "" },
  Options,
  runOnMain: (files, o, p) => run(files, o as O, p),
  zipName: "images.zip",
};
