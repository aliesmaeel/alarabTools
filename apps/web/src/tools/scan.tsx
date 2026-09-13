"use client";

import { useTranslations } from "next-intl";
import type { OptionsProps, ToolModule } from "./types";
import { RadioGroup } from "./fields";

type O = { enhance: "none" | "gray" | "bw"; pageSize: "a4" | "fit" };

function Options({ value, onChange }: OptionsProps<O>) {
  const t = useTranslations("options.scan");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("enhance")}</span>
        <RadioGroup name="enhance" value={value.enhance} onChange={(enhance) => onChange({ ...value, enhance })} options={[{ value: "gray", label: t("gray") }, { value: "bw", label: t("bw") }, { value: "none", label: t("none") }]} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("pageSize")}</span>
        <RadioGroup name="scan-page" value={value.pageSize} onChange={(pageSize) => onChange({ ...value, pageSize })} options={[{ value: "a4", label: t("a4") }, { value: "fit", label: t("fit") }]} />
      </div>
    </div>
  );
}

export const scanToPdf: ToolModule<O> = {
  defaults: { enhance: "gray", pageSize: "a4" },
  Options,
  reorder: true,
  camera: true,
};
