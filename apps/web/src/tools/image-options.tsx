"use client";

import { useTranslations } from "next-intl";
import type { ResizeSpec } from "@alarab/image-core";
import type { OptionsProps, ToolModule } from "./types";
import { Checkbox, Field, RadioGroup, TextInput } from "./fields";

// ---------- Compress ----------
type CompressO = { level: "high" | "recommended" | "extreme" };
function CompressOptions({ value, onChange }: OptionsProps<CompressO>) {
  const t = useTranslations("options.compressImage");
  return (
    <RadioGroup
      name="level"
      value={value.level}
      onChange={(level) => onChange({ level })}
      options={[
        { value: "recommended", label: t("recommended"), hint: t("recommendedHint") },
        { value: "high", label: t("high"), hint: t("highHint") },
        { value: "extreme", label: t("extreme"), hint: t("extremeHint") },
      ]}
    />
  );
}
export const compressImage: ToolModule<CompressO> = { defaults: { level: "recommended" }, Options: CompressOptions, zipName: "compressed.zip" };

// ---------- Resize ----------
type ResizeO = { mode: ResizeSpec["mode"]; percent: number; width: number; height: number; enlarge: boolean; spec?: ResizeSpec };
function ResizeOptions({ value, onChange }: OptionsProps<ResizeO>) {
  const t = useTranslations("options.resize");
  const set = (patch: Partial<ResizeO>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        name="resize-mode"
        value={value.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: "percent", label: t("percent") },
          { value: "width", label: t("width") },
          { value: "height", label: t("height") },
          { value: "box", label: t("box"), hint: t("boxHint") },
        ]}
      />
      {value.mode === "percent" && (
        <Field label={t("percentLabel")}>{(id) => <TextInput id={id} type="number" min={1} max={400} value={value.percent} onChange={(e) => set({ percent: Number(e.target.value) })} />}</Field>
      )}
      {(value.mode === "width" || value.mode === "box") && (
        <Field label={t("widthPx")}>{(id) => <TextInput id={id} type="number" min={1} max={16000} value={value.width} onChange={(e) => set({ width: Number(e.target.value) })} />}</Field>
      )}
      {(value.mode === "height" || value.mode === "box") && (
        <Field label={t("heightPx")}>{(id) => <TextInput id={id} type="number" min={1} max={16000} value={value.height} onChange={(e) => set({ height: Number(e.target.value) })} />}</Field>
      )}
      <Checkbox checked={value.enlarge} onChange={(enlarge) => set({ enlarge })} label={t("enlarge")} />
    </div>
  );
}
function specOf(o: ResizeO): ResizeSpec {
  if (o.mode === "percent") return { mode: "percent", percent: o.percent };
  if (o.mode === "width") return { mode: "width", width: o.width };
  if (o.mode === "height") return { mode: "height", height: o.height };
  return { mode: "box", width: o.width, height: o.height };
}
export const resizeImage: ToolModule<ResizeO> = {
  defaults: { mode: "percent", percent: 50, width: 1920, height: 1080, enlarge: false },
  Options: ResizeOptions,
  validate: (o) => ((o.mode === "percent" ? o.percent > 0 : o.mode === "height" ? o.height > 0 : o.width > 0 && (o.mode !== "box" || o.height > 0)) ? null : "needSize"),
  prepare: (o) => ({ ...o, spec: specOf(o) }),
  zipName: "resized.zip",
};

// ---------- Convert to JPG ----------
type ToJpgO = { quality: number; background: string };
function ToJpgOptions({ value, onChange }: OptionsProps<ToJpgO>) {
  const t = useTranslations("options.convert");
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("quality")}>{(id) => <TextInput id={id} type="number" min={30} max={100} value={value.quality} onChange={(e) => onChange({ ...value, quality: Number(e.target.value) })} />}</Field>
      <Field label={t("background")} hint={t("backgroundHint")}>
        {(id) => <input id={id} type="color" value={value.background} onChange={(e) => onChange({ ...value, background: e.target.value })} className="h-11 w-full cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />}
      </Field>
    </div>
  );
}
export const convertToJpg: ToolModule<ToJpgO> = { defaults: { quality: 88, background: "#ffffff" }, Options: ToJpgOptions, zipName: "jpg.zip" };

// ---------- Convert from JPG ----------
type FromJpgO = { format: "png" | "webp"; quality: number };
function FromJpgOptions({ value, onChange }: OptionsProps<FromJpgO>) {
  const t = useTranslations("options.convert");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup name="to-format" value={value.format} onChange={(format) => onChange({ ...value, format })} options={[{ value: "png", label: "PNG", hint: t("pngHint") }, { value: "webp", label: "WebP", hint: t("webpHint") }]} />
      {value.format === "webp" && <Field label={t("quality")}>{(id) => <TextInput id={id} type="number" min={30} max={100} value={value.quality} onChange={(e) => onChange({ ...value, quality: Number(e.target.value) })} />}</Field>}
    </div>
  );
}
export const convertFromJpg: ToolModule<FromJpgO> = { defaults: { format: "png", quality: 85 }, Options: FromJpgOptions, zipName: "converted.zip" };

// ---------- Rotate ----------
type RotateO = { angle: "0" | "90" | "180" | "270"; flipH: boolean; flipV: boolean };
function RotateImageOptions({ value, onChange }: OptionsProps<RotateO>) {
  const t = useTranslations("options");
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup name="img-angle" value={value.angle} onChange={(angle) => onChange({ ...value, angle })} options={[{ value: "90", label: t("rotate.cw") }, { value: "270", label: t("rotate.ccw") }, { value: "180", label: t("rotate.flip") }, { value: "0", label: t("rotateImage.none") }]} />
      <Checkbox checked={value.flipH} onChange={(flipH) => onChange({ ...value, flipH })} label={t("rotateImage.flipH")} />
      <Checkbox checked={value.flipV} onChange={(flipV) => onChange({ ...value, flipV })} label={t("rotateImage.flipV")} />
    </div>
  );
}
export const rotateImage: ToolModule<RotateO> = {
  defaults: { angle: "90", flipH: false, flipV: false },
  Options: RotateImageOptions,
  validate: (o) => (o.angle !== "0" || o.flipH || o.flipV ? null : "needChange"),
  zipName: "rotated.zip",
};
