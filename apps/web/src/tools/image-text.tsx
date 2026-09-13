"use client";

import { useTranslations } from "next-intl";
import { DEFAULT_FONT, type FontId } from "@alarab/arabic";
import type { OptionsProps, ToolModule } from "./types";
import { Field, RadioGroup, TextInput, inputCls } from "./fields";
import { FontSelect, PositionPicker, type Position } from "./text-options";

function ColorInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />;
}

// ---------- Watermark image ----------
type WatermarkO = { kind: "text" | "image"; text: string; image: File | null; widthPercent: number; font: FontId; sizePercent: number; color: string; opacity: number; layout: "center" | "tile" | "corner"; position: Position; rotate: number; margin: number };
function WatermarkImageOptions({ value, onChange }: OptionsProps<WatermarkO>) {
  const t = useTranslations("options");
  const set = (patch: Partial<WatermarkO>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup name="wmi-kind" value={value.kind} onChange={(kind) => set({ kind })} options={[{ value: "text", label: t("watermark.kindText") }, { value: "image", label: t("watermark.kindImage") }]} />
      {value.kind === "text" ? (
        <Field label={t("watermark.text")}>
          {(id) => <textarea id={id} rows={2} value={value.text} onChange={(e) => set({ text: e.target.value })} className={`${inputCls} h-auto py-2`} placeholder={t("watermark.placeholder")} />}
        </Field>
      ) : (
        <>
          <Field label={t("watermark.image")} hint={value.image ? value.image.name : t("watermark.imageHint")}>
            {(id) => <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => set({ image: e.target.files?.[0] ?? null })} className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-lapis-soft file:px-3 file:py-2 file:font-medium file:text-lapis" />}
          </Field>
          <Field label={t("watermarkImage.widthPercent")}>
            {(id) => <TextInput id={id} type="number" min={5} max={100} step={5} value={value.widthPercent} onChange={(e) => set({ widthPercent: Number(e.target.value) })} />}
          </Field>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("watermark.layout")}</span>
        <RadioGroup name="wmi-layout" value={value.layout} onChange={(layout) => set({ layout })} options={[{ value: "center", label: t("watermarkImage.center") }, { value: "tile", label: t("watermarkImage.tile") }, { value: "corner", label: t("watermarkImage.corner") }]} />
      </div>
      {value.layout === "corner" && <PositionPicker value={value.position} onChange={(position) => set({ position })} allowCenter={false} />}
      {value.kind === "text" && <FontSelect value={value.font} onChange={(font) => set({ font })} />}
      {value.kind === "text" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("watermarkImage.sizePercent")}>{(id) => <TextInput id={id} type="number" min={1} max={50} value={value.sizePercent} onChange={(e) => set({ sizePercent: Number(e.target.value) })} />}</Field>
          <Field label={t("color")}>{(id) => <ColorInput id={id} value={value.color} onChange={(color) => set({ color })} />}</Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("opacity")}>{(id) => <TextInput id={id} type="number" min={5} max={100} step={5} value={value.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />}</Field>
        {value.kind === "text" ? (
          <Field label={t("watermark.rotate")}>{(id) => <TextInput id={id} type="number" min={-90} max={90} step={15} value={value.rotate} onChange={(e) => set({ rotate: Number(e.target.value) })} />}</Field>
        ) : (
          <Field label={t("watermarkImage.margin")}>{(id) => <TextInput id={id} type="number" min={0} max={30} value={value.margin} onChange={(e) => set({ margin: Number(e.target.value) })} />}</Field>
        )}
      </div>
    </div>
  );
}
export const watermarkImage: ToolModule<WatermarkO> = {
  defaults: { kind: "text", text: "", image: null, widthPercent: 30, font: DEFAULT_FONT, sizePercent: 8, color: "#ffffff", opacity: 50, layout: "center", position: "bottom-right", rotate: 30, margin: 3 },
  Options: WatermarkImageOptions,
  validate: (o) => (o.kind === "image" ? (o.image ? null : "needImage") : o.text.trim() ? null : "needText"),
  zipName: "watermarked.zip",
};

// ---------- Meme generator ----------
type MemeO = { top: string; bottom: string; font: FontId; sizePercent: number; color: string; stroke: string };
function MemeOptions({ value, onChange }: OptionsProps<MemeO>) {
  const t = useTranslations("options");
  const set = (patch: Partial<MemeO>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("meme.top")}>{(id) => <TextInput id={id} value={value.top} placeholder={t("meme.topPlaceholder")} onChange={(e) => set({ top: e.target.value })} />}</Field>
      <Field label={t("meme.bottom")}>{(id) => <TextInput id={id} value={value.bottom} placeholder={t("meme.bottomPlaceholder")} onChange={(e) => set({ bottom: e.target.value })} />}</Field>
      <FontSelect value={value.font} onChange={(font) => set({ font })} />
      <div className="grid grid-cols-3 gap-3">
        <Field label={t("meme.sizePercent")}>{(id) => <TextInput id={id} type="number" min={2} max={30} value={value.sizePercent} onChange={(e) => set({ sizePercent: Number(e.target.value) })} />}</Field>
        <Field label={t("color")}>{(id) => <ColorInput id={id} value={value.color} onChange={(color) => set({ color })} />}</Field>
        <Field label={t("meme.stroke")}>{(id) => <ColorInput id={id} value={value.stroke} onChange={(stroke) => set({ stroke })} />}</Field>
      </div>
    </div>
  );
}
export const memeGenerator: ToolModule<MemeO> = {
  defaults: { top: "", bottom: "", font: "reem-kufi", sizePercent: 9, color: "#ffffff", stroke: "#000000" },
  Options: MemeOptions,
  validate: (o) => (o.top.trim() || o.bottom.trim() ? null : "needCaption"),
};
