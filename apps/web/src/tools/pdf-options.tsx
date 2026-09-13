"use client";

import { useTranslations } from "next-intl";
import type { OptionsProps, ToolModule } from "./types";
import { Checkbox, Field, RadioGroup, TextInput } from "./fields";

// ---------- Merge ----------
export const mergePdf: ToolModule = { defaults: {}, reorder: true };

// ---------- Split ----------
type SplitO = { mode: "all" | "every" | "ranges"; every: number; ranges: string };
function SplitOptions({ value, onChange, pageCount }: OptionsProps<SplitO>) {
  const t = useTranslations("options");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        name="split-mode"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: "ranges", label: t("split.ranges"), hint: t("split.rangesHint") },
          { value: "every", label: t("split.every") },
          { value: "all", label: t("split.all", { count: pageCount ?? 0 }) },
        ]}
      />
      {value.mode === "ranges" && (
        <Field label={t("split.rangesLabel")} hint={t("pagesExample", { count: pageCount ?? 10 })}>
          {(id) => <TextInput id={id} dir="ltr" value={value.ranges} placeholder="1-3; 4-6" onChange={(e) => onChange({ ...value, ranges: e.target.value })} />}
        </Field>
      )}
      {value.mode === "every" && (
        <Field label={t("split.everyLabel")}>
          {(id) => <TextInput id={id} type="number" min={1} value={value.every} onChange={(e) => onChange({ ...value, every: Number(e.target.value) })} />}
        </Field>
      )}
    </div>
  );
}
export const splitPdf: ToolModule<SplitO> = {
  defaults: { mode: "ranges", every: 1, ranges: "" },
  Options: SplitOptions,
  validate: (o) => (o.mode === "ranges" && !o.ranges.trim() ? "needPages" : null),
  zipName: "split.zip",
};

// ---------- Remove / Extract pages ----------
type PagesO = { pages: string };
function makePagesOptions(labelKey: "removePages.label" | "extractPages.label") {
  return function PagesOptions({ value, onChange, pageCount }: OptionsProps<PagesO>) {
    const t = useTranslations("options");
    return (
      <Field label={t(labelKey)} hint={t("pagesExample", { count: pageCount ?? 10 })}>
        {(id) => <TextInput id={id} dir="ltr" value={value.pages} placeholder="2, 5-7" onChange={(e) => onChange({ pages: e.target.value })} />}
      </Field>
    );
  };
}
export const removePages: ToolModule<PagesO> = { defaults: { pages: "" }, Options: makePagesOptions("removePages.label"), validate: (o) => (o.pages.trim() ? null : "needPages") };
export const extractPages: ToolModule<PagesO> = { defaults: { pages: "" }, Options: makePagesOptions("extractPages.label"), validate: (o) => (o.pages.trim() ? null : "needPages") };

// ---------- Rotate ----------
type RotateO = { angle: "90" | "180" | "270"; pages: string };
function RotateOptions({ value, onChange, pageCount, fileCount }: OptionsProps<RotateO>) {
  const t = useTranslations("options");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        name="angle"
        value={value.angle}
        onChange={(angle) => onChange({ ...value, angle })}
        options={[
          { value: "90", label: t("rotate.cw") },
          { value: "270", label: t("rotate.ccw") },
          { value: "180", label: t("rotate.flip") },
        ]}
      />
      {fileCount === 1 && (
        <Field label={t("rotate.pages")} hint={t("pagesExample", { count: pageCount ?? 10 })}>
          {(id) => <TextInput id={id} dir="ltr" value={value.pages} placeholder={t("rotate.allPages")} onChange={(e) => onChange({ ...value, pages: e.target.value })} />}
        </Field>
      )}
    </div>
  );
}
export const rotatePdf: ToolModule<RotateO> = { defaults: { angle: "90", pages: "" }, Options: RotateOptions, zipName: "rotated.zip" };

// ---------- Crop ----------
type CropO = { top: number; right: number; bottom: number; left: number };
function CropOptions({ value, onChange }: OptionsProps<CropO>) {
  const t = useTranslations("options");
  const sides: (keyof CropO)[] = ["top", "bottom", "left", "right"];
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm text-ink-2">{t("crop.intro")}</span>
      <div className="grid grid-cols-2 gap-3">
        {sides.map((side) => (
          <Field key={side} label={t(`crop.${side}`)}>
            {(id) => <TextInput id={id} type="number" min={0} step={1} value={value[side]} onChange={(e) => onChange({ ...value, [side]: Number(e.target.value) })} />}
          </Field>
        ))}
      </div>
    </div>
  );
}
export const cropPdf: ToolModule<CropO> = {
  defaults: { top: 10, right: 10, bottom: 10, left: 10 },
  Options: CropOptions,
  validate: (o) => (o.top + o.right + o.bottom + o.left > 0 ? null : "needCrop"),
};

// ---------- Protect ----------
type ProtectO = { password: string; confirm: string; allowPrint: boolean; allowCopy: boolean; allowModify: boolean };
function ProtectOptions({ value, onChange }: OptionsProps<ProtectO>) {
  const t = useTranslations("options");
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("protect.password")}>
        {(id) => <TextInput id={id} type="password" autoComplete="new-password" dir="ltr" value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} />}
      </Field>
      <Field label={t("protect.confirm")}>
        {(id) => <TextInput id={id} type="password" autoComplete="new-password" dir="ltr" value={value.confirm} onChange={(e) => onChange({ ...value, confirm: e.target.value })} />}
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("protect.permissions")}</span>
        <Checkbox checked={value.allowPrint} onChange={(v) => onChange({ ...value, allowPrint: v })} label={t("protect.allowPrint")} />
        <Checkbox checked={value.allowCopy} onChange={(v) => onChange({ ...value, allowCopy: v })} label={t("protect.allowCopy")} />
        <Checkbox checked={value.allowModify} onChange={(v) => onChange({ ...value, allowModify: v })} label={t("protect.allowModify")} />
      </div>
    </div>
  );
}
export const protectPdf: ToolModule<ProtectO> = {
  defaults: { password: "", confirm: "", allowPrint: true, allowCopy: true, allowModify: false },
  Options: ProtectOptions,
  validate: (o) => (!o.password ? "needPassword" : o.password !== o.confirm ? "passwordMismatch" : null),
  zipName: "protected.zip",
};

// ---------- Unlock ----------
type UnlockO = { password: string };
function UnlockOptions({ value, onChange }: OptionsProps<UnlockO>) {
  const t = useTranslations("options");
  return (
    <Field label={t("unlock.password")} hint={t("unlock.hint")}>
      {(id) => <TextInput id={id} type="password" autoComplete="off" dir="ltr" value={value.password} onChange={(e) => onChange({ password: e.target.value })} />}
    </Field>
  );
}
export const unlockPdf: ToolModule<UnlockO> = { defaults: { password: "" }, Options: UnlockOptions, zipName: "unlocked.zip" };

// ---------- JPG to PDF ----------
type ImgO = { pageSize: "fit" | "a4"; margin: boolean };
function ImagesOptions({ value, onChange }: OptionsProps<ImgO>) {
  const t = useTranslations("options");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        name="page-size"
        value={value.pageSize}
        onChange={(pageSize) => onChange({ ...value, pageSize })}
        options={[
          { value: "fit", label: t("images.fit"), hint: t("images.fitHint") },
          { value: "a4", label: t("images.a4"), hint: t("images.a4Hint") },
        ]}
      />
      {value.pageSize === "a4" && <Checkbox checked={value.margin} onChange={(margin) => onChange({ ...value, margin })} label={t("images.margin")} />}
    </div>
  );
}
export const jpgToPdf: ToolModule<ImgO> = { defaults: { pageSize: "fit", margin: true }, Options: ImagesOptions, reorder: true };
