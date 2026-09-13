"use client";

import { useTranslations } from "next-intl";
import type { OptionsProps, ToolModule } from "./types";
import { Checkbox, Field, RadioGroup, TextInput } from "./fields";

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

// ---------- OCR ----------
type OcrO = { language: "both" | "ar" | "en" };
function OcrOptions({ value, onChange }: OptionsProps<OcrO>) {
  const t = useTranslations("options.ocr");
  return (
    <RadioGroup name="ocr-lang" value={value.language} onChange={(language) => onChange({ language })} options={[{ value: "both", label: t("both") }, { value: "ar", label: t("ar") }, { value: "en", label: t("en") }]} />
  );
}
export const ocrPdf: ToolModule<OcrO> = { defaults: { language: "both" }, Options: OcrOptions, zipName: "ocr.zip" };

// ---------- PDF to Office ----------
export const pdfToWord = plain("word.zip");
export const pdfToExcel = plain("excel.zip");
export const pdfToPowerpoint = plain("powerpoint.zip");

// ---------- Fix Arabic text ----------
type FixO = { reverseLtrRuns: boolean };
function FixOptions({ value, onChange }: OptionsProps<FixO>) {
  const t = useTranslations("options.fixArabic");
  return (
    <div className="flex flex-col gap-3">
      <Checkbox checked={value.reverseLtrRuns} onChange={(reverseLtrRuns) => onChange({ reverseLtrRuns })} label={t("reverseRuns")} />
      <span className="text-xs text-ink-2">{t("hint")}</span>
    </div>
  );
}
export const fixArabicText: ToolModule<FixO> = { defaults: { reverseLtrRuns: false }, Options: FixOptions, zipName: "fixed.zip" };

// ---------- Summarize ----------
type SummO = { language: "ar" | "en"; length: "short" | "medium" | "long" };
function SummarizeOptions({ value, onChange }: OptionsProps<SummO>) {
  const t = useTranslations("options.summarize");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup name="sum-lang" value={value.language} onChange={(language) => onChange({ ...value, language })} options={[{ value: "ar", label: t("ar") }, { value: "en", label: t("en") }]} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("length")}</span>
        <RadioGroup name="sum-len" value={value.length} onChange={(length) => onChange({ ...value, length })} options={[{ value: "short", label: t("short") }, { value: "medium", label: t("medium") }, { value: "long", label: t("long") }]} />
      </div>
    </div>
  );
}
export const summarizePdf: ToolModule<SummO> = { defaults: { language: "ar", length: "medium" }, Options: SummarizeOptions, zipName: "summary.zip" };

// ---------- Translate ----------
type TransO = { to: "ar" | "en" };
function TranslateOptions({ value, onChange }: OptionsProps<TransO>) {
  const t = useTranslations("options.translate");
  return (
    <RadioGroup name="tr-to" value={value.to} onChange={(to) => onChange({ to })} options={[{ value: "ar", label: t("toAr"), hint: t("toArHint") }, { value: "en", label: t("toEn"), hint: t("toEnHint") }]} />
  );
}
export const translatePdf: ToolModule<TransO> = { defaults: { to: "ar" }, Options: TranslateOptions, zipName: "translation.zip" };

// ---------- Remove background ----------
type BgO = { model: "isnet-general-use" | "u2net_human_seg"; alphaMatting: boolean };
function BgOptions({ value, onChange }: OptionsProps<BgO>) {
  const t = useTranslations("options.removeBg");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup name="bg-model" value={value.model} onChange={(model) => onChange({ ...value, model })} options={[{ value: "isnet-general-use", label: t("general"), hint: t("generalHint") }, { value: "u2net_human_seg", label: t("people"), hint: t("peopleHint") }]} />
      <Checkbox checked={value.alphaMatting} onChange={(alphaMatting) => onChange({ ...value, alphaMatting })} label={t("matting")} />
    </div>
  );
}
export const removeBackground: ToolModule<BgO> = { defaults: { model: "isnet-general-use", alphaMatting: false }, Options: BgOptions, zipName: "no-background.zip" };
