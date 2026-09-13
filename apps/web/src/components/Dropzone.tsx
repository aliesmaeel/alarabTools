"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

type Props = {
  accepts: readonly string[];
  maxFiles: number;
  maxBytes: number;
  /** Translated noun for the singular prompt, e.g. "PDF" or "image". */
  what: string;
  /** Called when the tool has real processing. Until then, files are just listed. */
  onFiles?: (files: File[]) => void;
  /** Show a camera button on touch devices. */
  camera?: boolean;
};

function formatBytes(n: number, locale: string) {
  const mb = n / (1024 * 1024);
  const kb = n / 1024;
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (mb >= 1) return locale === "ar" ? `${nf.format(mb)} م.ب` : `${nf.format(mb)} MB`;
  return locale === "ar" ? `${nf.format(kb)} ك.ب` : `${nf.format(kb)} KB`;
}

export function Dropzone({ accepts, maxFiles, maxBytes, what, onFiles, camera }: Props) {
  const t = useTranslations("tool");
  const locale = useLocale();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const maxMb = Math.round(maxBytes / (1024 * 1024));

  function accept(list: FileList | File[]) {
    const next = Array.from(list).slice(0, maxFiles);
    const tooBig = next.find((f) => f.size > maxBytes);
    if (tooBig) {
      setError(`${tooBig.name}: > ${maxMb} MB`);
      return;
    }
    setError(null);
    setFiles(next);
    onFiles?.(next);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) accept(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          over ? "border-lapis bg-lapis-soft" : "border-line-2 bg-surface"
        }`}
      >
        <span className="grid size-14 place-items-center rounded-full bg-lapis-soft text-lapis">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />
          </svg>
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {maxFiles > 1 ? t("dropTitlePlural") : t("dropTitle", { what })}
          </span>
          <span className="text-sm text-ink-2">{t("dropHint", { maxFiles, maxMb })}</span>
        </div>
        <label
          htmlFor={inputId}
          className="inline-flex h-12 cursor-pointer items-center rounded-[10px] bg-lapis px-6 text-base font-semibold text-white hover:bg-lapis-deep focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lapis"
        >
          {t("choose")}
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={accepts.join(",")}
            multiple={maxFiles > 1}
            onChange={(e) => e.target.files && accept(e.target.files)}
          />
        </label>
        {camera && (
          <label className="hidden h-12 cursor-pointer items-center gap-2 rounded-[10px] border border-line-2 bg-surface px-5 text-base font-medium [@media(pointer:coarse)]:inline-flex">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            {t("takePhoto")}
            <input type="file" className="sr-only" accept="image/*" capture="environment" onChange={(e) => e.target.files && accept(e.target.files)} />
          </label>
        )}
        {error && <span role="alert" className="text-sm font-medium text-red">{error}</span>}
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
              <span className="truncate font-medium">{f.name}</span>
              <span className="shrink-0 text-ink-2">{formatBytes(f.size, locale)}</span>
            </li>
          ))}
          <li className="rounded-lg bg-saffron-soft px-4 py-3 text-sm text-saffron-deep">{t("comingSoon")}</li>
        </ul>
      )}
    </div>
  );
}
