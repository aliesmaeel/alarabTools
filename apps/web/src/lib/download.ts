"use client";

import { zipSync } from "fflate";
import type { Output } from "@/workers/pdf.worker";

/** Bundle outputs into one downloadable file: a single result as-is, several as a ZIP. */
export function bundle(outputs: Output[], zipName: string): { blob: Blob; name: string } {
  if (outputs.length === 1) {
    const [o] = outputs;
    return { blob: new Blob([o.bytes as BlobPart], { type: o.mime }), name: o.name };
  }
  const entries: Record<string, Uint8Array> = {};
  for (const o of outputs) {
    let name = o.name;
    let i = 2;
    while (entries[name]) name = o.name.replace(/(\.[^.]+)$/, `-${i++}$1`);
    entries[name] = o.bytes;
  }
  // PDFs are already deflated, so store rather than recompress.
  const zipped = zipSync(entries, { level: 0 });
  return { blob: new Blob([zipped as BlobPart], { type: "application/zip" }), name: zipName };
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatBytes(n: number, locale: string) {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const mb = n / (1024 * 1024);
  if (mb >= 1) return locale === "ar" ? `${nf.format(mb)} م.ب` : `${nf.format(mb)} MB`;
  return locale === "ar" ? `${nf.format(n / 1024)} ك.ب` : `${nf.format(n / 1024)} KB`;
}
