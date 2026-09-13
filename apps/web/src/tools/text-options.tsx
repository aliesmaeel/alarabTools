"use client";

import { useLocale, useTranslations } from "next-intl";
import { FONTS, DEFAULT_FONT, defaultDigits, type DigitSystem, type FontId } from "@alarab/arabic";
import type { OptionsProps, ToolModule } from "./types";
import { Checkbox, Field, RadioGroup, TextInput, inputCls } from "./fields";

type Position = "top-left" | "top-center" | "top-right" | "center" | "bottom-left" | "bottom-center" | "bottom-right";
const ALL_POSITIONS: Position[] = ["top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right"];

function PositionPicker({ value, onChange, allowCenter }: { value: Position; onChange: (p: Position) => void; allowCenter: boolean }) {
  const t = useTranslations("options.position");
  const cells: (Position | null)[] = ["top-left", "top-center", "top-right", null, allowCenter ? "center" : null, null, "bottom-left", "bottom-center", "bottom-right"];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t("label")}</span>
      {/* Physical layout on purpose: it mirrors the page, not the UI direction. */}
      <div dir="ltr" className="grid aspect-[3/4] w-[132px] grid-cols-3 gap-1 rounded-lg border border-line-2 bg-ground p-1.5">
        {cells.map((p, i) => (
          <button
            key={i}
            type="button"
            disabled={!p}
            aria-label={p ? t(p) : undefined}
            aria-pressed={p === value}
            onClick={() => p && onChange(p)}
            className={`rounded-md border ${p === value ? "border-lapis bg-lapis" : p ? "border-line bg-surface hover:border-lapis" : "border-transparent"}`}
          />
        ))}
      </div>
    </div>
  );
}

function FontSelect({ value, onChange }: { value: FontId; onChange: (f: FontId) => void }) {
  const t = useTranslations("options");
  const locale = useLocale() as "ar" | "en";
  return (
    <Field label={t("font")}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as FontId)} className={inputCls}>
          {FONTS.map((f) => (
            <option key={f.id} value={f.id}>{f.name[locale]}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

function DigitsRadio({ value, onChange }: { value: DigitSystem; onChange: (d: DigitSystem) => void }) {
  const t = useTranslations("options.digits");
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t("label")}</span>
      <RadioGroup name="digits" value={value} onChange={onChange} options={[{ value: "arab", label: "١٢٣" }, { value: "latn", label: "123" }]} />
    </div>
  );
}

function SizeAndColor<O extends { size: number; color: string }>({ value, onChange }: { value: O; onChange: (o: O) => void }) {
  const t = useTranslations("options");
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("size")}>
        {(id) => <TextInput id={id} type="number" min={6} max={200} value={value.size} onChange={(e) => onChange({ ...value, size: Number(e.target.value) })} />}
      </Field>
      <Field label={t("color")}>
        {(id) => <input id={id} type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} className="h-11 w-full cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />}
      </Field>
    </div>
  );
}

// ---------- Page numbers ----------
type PageNumbersO = { template: string; digits: DigitSystem | ""; font: FontId; size: number; color: string; position: Position; margin: number; start: number; pages: string };
function PageNumbersOptions({ value, onChange, pageCount }: OptionsProps<PageNumbersO>) {
  const t = useTranslations("options");
  const locale = useLocale();
  const digits = value.digits || defaultDigits(locale);
  const templates = [
    { value: "{n}", label: t("pageNumbers.plain") },
    { value: "{n} / {total}", label: t("pageNumbers.ofTotal") },
    { value: locale === "ar" ? "صفحة {n} من {total}" : "Page {n} of {total}", label: t("pageNumbers.worded") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("pageNumbers.format")}</span>
        <RadioGroup name="template" value={value.template} onChange={(template) => onChange({ ...value, template })} options={templates} />
      </div>
      <DigitsRadio value={digits} onChange={(d) => onChange({ ...value, digits: d })} />
      <PositionPicker value={value.position} onChange={(position) => onChange({ ...value, position })} allowCenter={false} />
      <FontSelect value={value.font} onChange={(font) => onChange({ ...value, font })} />
      <SizeAndColor value={value} onChange={onChange} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("pageNumbers.start")}>
          {(id) => <TextInput id={id} type="number" min={0} value={value.start} onChange={(e) => onChange({ ...value, start: Number(e.target.value) })} />}
        </Field>
        <Field label={t("margin")}>
          {(id) => <TextInput id={id} type="number" min={0} value={value.margin} onChange={(e) => onChange({ ...value, margin: Number(e.target.value) })} />}
        </Field>
      </div>
      <Field label={t("pagesOptional")} hint={t("pagesExample", { count: pageCount ?? 10 })}>
        {(id) => <TextInput id={id} dir="ltr" value={value.pages} placeholder={t("rotate.allPages")} onChange={(e) => onChange({ ...value, pages: e.target.value })} />}
      </Field>
    </div>
  );
}
export const addPageNumbers: ToolModule<PageNumbersO> = {
  defaults: { template: "{n}", digits: "", font: DEFAULT_FONT, size: 12, color: "#161b2f", position: "bottom-center", margin: 12, start: 1, pages: "" },
  Options: PageNumbersOptions,
};

// ---------- Watermark ----------
type WatermarkO = { text: string; font: FontId; size: number; color: string; opacity: number; layout: "center" | "tile" | "corner"; position: Position; rotate: number; pages: string };
function WatermarkOptions({ value, onChange, pageCount }: OptionsProps<WatermarkO>) {
  const t = useTranslations("options");
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("watermark.text")}>
        {(id) => <textarea id={id} rows={2} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} className={`${inputCls} h-auto py-2`} placeholder={t("watermark.placeholder")} />}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("watermark.layout")}</span>
        <RadioGroup
          name="wm-layout"
          value={value.layout}
          onChange={(layout) => onChange({ ...value, layout })}
          options={[
            { value: "center", label: t("watermark.center") },
            { value: "tile", label: t("watermark.tile") },
            { value: "corner", label: t("watermark.corner") },
          ]}
        />
      </div>
      {value.layout === "corner" && <PositionPicker value={value.position} onChange={(position) => onChange({ ...value, position })} allowCenter={false} />}
      <FontSelect value={value.font} onChange={(font) => onChange({ ...value, font })} />
      <SizeAndColor value={value} onChange={onChange} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("opacity")}>
          {(id) => <TextInput id={id} type="number" min={5} max={100} step={5} value={value.opacity} onChange={(e) => onChange({ ...value, opacity: Number(e.target.value) })} />}
        </Field>
        <Field label={t("watermark.rotate")}>
          {(id) => <TextInput id={id} type="number" min={-90} max={90} step={15} value={value.rotate} onChange={(e) => onChange({ ...value, rotate: Number(e.target.value) })} />}
        </Field>
      </div>
      <Field label={t("pagesOptional")} hint={t("pagesExample", { count: pageCount ?? 10 })}>
        {(id) => <TextInput id={id} dir="ltr" value={value.pages} placeholder={t("rotate.allPages")} onChange={(e) => onChange({ ...value, pages: e.target.value })} />}
      </Field>
    </div>
  );
}
export const addWatermark: ToolModule<WatermarkO> = {
  defaults: { text: "", font: "amiri-bold", size: 48, color: "#b42318", opacity: 25, layout: "center", position: "top-right", rotate: 45, pages: "" },
  Options: WatermarkOptions,
  validate: (o) => (o.text.trim() ? null : "needText"),
  zipName: "watermarked.zip",
};

// ---------- Hijri date stamp ----------
type HijriO = { date: string; calendars: "both" | "hijri" | "gregorian"; dateStyle: "long" | "numeric"; digits: DigitSystem | ""; font: FontId; size: number; color: string; position: Position; margin: number; opacity: number; prefix: string; pages: string };
function HijriOptions({ value, onChange, pageCount }: OptionsProps<HijriO>) {
  const t = useTranslations("options");
  const locale = useLocale();
  const digits = value.digits || defaultDigits(locale);
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("hijri.date")} hint={t("hijri.dateHint")}>
        {(id) => <TextInput id={id} type="date" dir="ltr" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} />}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("hijri.calendars")}</span>
        <RadioGroup
          name="calendars"
          value={value.calendars}
          onChange={(calendars) => onChange({ ...value, calendars })}
          options={[
            { value: "both", label: t("hijri.both") },
            { value: "hijri", label: t("hijri.hijriOnly") },
            { value: "gregorian", label: t("hijri.gregorianOnly") },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("hijri.style")}</span>
        <RadioGroup name="date-style" value={value.dateStyle} onChange={(dateStyle) => onChange({ ...value, dateStyle })} options={[{ value: "long", label: t("hijri.long") }, { value: "numeric", label: t("hijri.numeric") }]} />
      </div>
      <DigitsRadio value={digits} onChange={(d) => onChange({ ...value, digits: d })} />
      <Field label={t("hijri.prefix")}>
        {(id) => <TextInput id={id} value={value.prefix} placeholder={t("hijri.prefixPlaceholder")} onChange={(e) => onChange({ ...value, prefix: e.target.value })} />}
      </Field>
      <PositionPicker value={value.position} onChange={(position) => onChange({ ...value, position })} allowCenter />
      <FontSelect value={value.font} onChange={(font) => onChange({ ...value, font })} />
      <SizeAndColor value={value} onChange={onChange} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("opacity")}>
          {(id) => <TextInput id={id} type="number" min={5} max={100} step={5} value={value.opacity} onChange={(e) => onChange({ ...value, opacity: Number(e.target.value) })} />}
        </Field>
        <Field label={t("margin")}>
          {(id) => <TextInput id={id} type="number" min={0} value={value.margin} onChange={(e) => onChange({ ...value, margin: Number(e.target.value) })} />}
        </Field>
      </div>
      <Checkbox checked={value.pages === "1"} onChange={(v) => onChange({ ...value, pages: v ? "1" : "" })} label={t("hijri.firstPageOnly")} />
      {value.pages !== "1" && value.pages !== "" && null}
      <span className="sr-only">{pageCount}</span>
    </div>
  );
}
export const hijriDateStamp: ToolModule<HijriO> = {
  defaults: { date: new Date().toISOString().slice(0, 10), calendars: "both", dateStyle: "long", digits: "", font: "amiri", size: 14, color: "#8f5606", position: "top-right", margin: 24, opacity: 100, prefix: "", pages: "1" },
  Options: HijriOptions,
  validate: (o) => (/^\d{4}-\d{2}-\d{2}$/.test(o.date) ? null : "needDate"),
  zipName: "stamped.zip",
};

export { ALL_POSITIONS };
