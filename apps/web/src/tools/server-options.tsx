"use client";

import { useTranslations } from "next-intl";
import type { OptionsProps, ToolModule } from "./types";
import { Field, RadioGroup, TextInput } from "./fields";

// ---------- Compress PDF (Ghostscript presets) ----------
type CompressO = { level: "screen" | "ebook" | "printer" };
function CompressOptions({ value, onChange }: OptionsProps<CompressO>) {
  const t = useTranslations("options.compressPdf");
  return (
    <RadioGroup
      name="pdf-level"
      value={value.level}
      onChange={(level) => onChange({ level })}
      options={[
        { value: "ebook", label: t("ebook"), hint: t("ebookHint") },
        { value: "screen", label: t("screen"), hint: t("screenHint") },
        { value: "printer", label: t("printer"), hint: t("printerHint") },
      ]}
    />
  );
}
export const compressPdf: ToolModule<CompressO> = { defaults: { level: "ebook" }, Options: CompressOptions, zipName: "compressed.zip" };

// ---------- Tools without options ----------
const plain = (zipName: string): ToolModule<Record<string, never>> => ({ defaults: {}, zipName });
export const repairPdf = plain("repaired.zip");
export const pdfToPdfa = plain("pdfa.zip");
export const wordToPdf = plain("pdf.zip");
export const excelToPdf = plain("pdf.zip");
export const powerpointToPdf = plain("pdf.zip");

// ---------- HTML to PDF / image (from a public URL) ----------
type UrlO = { url: string };
function UrlOptions({ value, onChange }: OptionsProps<UrlO>) {
  const t = useTranslations("options.html");
  return (
    <Field label={t("url")} hint={t("urlHint")}>
      {(id) => <TextInput id={id} dir="ltr" type="url" inputMode="url" placeholder="https://example.com" value={value.url} onChange={(e) => onChange({ url: e.target.value })} />}
    </Field>
  );
}
export function validUrl(u: string): boolean {
  try {
    const p = new URL(u.trim());
    return (p.protocol === "https:" || p.protocol === "http:") && !!p.hostname.includes(".");
  } catch {
    return false;
  }
}
const urlTool: ToolModule<UrlO> = { defaults: { url: "" }, Options: UrlOptions, noFiles: true, validate: (o) => (validUrl(o.url) ? null : "needUrl") };
export const htmlToPdf = urlTool;
export const htmlToImage = urlTool;
