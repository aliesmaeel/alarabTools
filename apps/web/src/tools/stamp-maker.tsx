"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ToolDef } from "@alarab/tools";
import { FONTS, defaultDigits, fontInfo, formatGregorian, formatHijri, type FontId } from "@alarab/arabic";
import type { ToolModule } from "./types";
import { Checkbox, Field, TextInput, inputCls } from "./fields";
import { PagePlacer, type Placement } from "@/components/PagePlacer";
import { ensureFont } from "@/lib/signature";
import { saveBlob } from "@/lib/download";
import * as engine from "@/lib/engine";
import { DEFAULT_STAMP, STAMP_SIZE, buildStampSvg, embeddedFontCss, hasContent, stampFileName, svgToPng, type StampDesign, type StampShape, type StampBorder } from "@/lib/stamp";

const DRAFT_KEY = "alarab:stamp:draft";
const MAX_LOGO = 2 * 1024 * 1024;
const INKS = ["#1d3fa8", "#b42318", "#0f6e4f", "#161b2f", "#6b3fa0"];
const PNG_WIDTHS = [600, 1200, 2400];

const I = (d: string) => <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden className="fill-none stroke-current stroke-[1.9]" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

function readDraft(locale: "ar" | "en"): StampDesign {
  const sample: Partial<StampDesign> = locale === "ar"
    ? { top: "مؤسسة النور للتجارة", bottom: "المملكة العربية السعودية", center: "الإدارة العامة" }
    : { top: "AL NOOR TRADING EST.", bottom: "Riyadh · Saudi Arabia", center: "APPROVED", font: "tajawal-bold" };
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<StampDesign>;
      if (typeof d.top === "string") return { ...DEFAULT_STAMP, ...d, logo: null };
    }
  } catch { /* storage blocked */ }
  return { ...DEFAULT_STAMP, ...sample };
}

const fontBytes = new Map<string, Promise<Uint8Array>>();
function loadFontBytes(id: string): Promise<Uint8Array> {
  const file = fontInfo(id).file;
  let p = fontBytes.get(file);
  if (!p) {
    p = fetch(`/fonts/${encodeURIComponent(file)}`).then(async (r) => {
      if (!r.ok) throw new Error(`font ${file}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    fontBytes.set(file, p);
  }
  return p;
}

/** The SVG with the font embedded, so PNG rasterisation and the downloaded SVG render identically anywhere. */
async function exportSvg(d: StampDesign): Promise<string> {
  return buildStampSvg(d, { fontFamily: "AlarabStamp", fontCss: embeddedFontCss("AlarabStamp", await loadFontBytes(d.font)) });
}

function ShapeButton({ shape, current, onPick, label }: { shape: StampShape; current: StampShape; onPick: (s: StampShape) => void; label: string }) {
  const active = shape === current;
  const glyph = shape === "round" ? <circle cx="12" cy="12" r="8.5" /> : shape === "oval" ? <ellipse cx="12" cy="12" rx="10" ry="7" /> : <rect x="3" y="6" width="18" height="12" rx="2" />;
  return (
    <button type="button" aria-pressed={active} onClick={() => onPick(shape)} className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-medium ${active ? "border-lapis bg-lapis-soft text-lapis-deep" : "border-line bg-surface text-ink-2 hover:border-ink-3"}`}>
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden className="fill-none stroke-current stroke-[1.8]">{glyph}</svg>
      {label}
    </button>
  );
}

function StampMaker({ tool }: { tool: ToolDef }) {
  const t = useTranslations("stamp");
  const locale = useLocale() as "ar" | "en";
  const [d, setD] = useState<StampDesign>(() => readDraft(locale));
  const [family, setFamily] = useState<string | null>(null);
  const [pngWidth, setPngWidth] = useState(1200);
  const [busy, setBusy] = useState<"png" | "svg" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [placement, setPlacement] = useState<Placement>({ page: 0, x: 0.6, y: 0.7, w: 0.28 });
  const [allPages, setAllPages] = useState(false);
  const [stampPng, setStampPng] = useState<{ url: string; bytes: Uint8Array } | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof StampDesign>(k: K, v: StampDesign[K]) => setD((p) => ({ ...p, [k]: v }));
  const ready = hasContent(d);
  const ratio = STAMP_SIZE[d.shape].h / STAMP_SIZE[d.shape].w;

  // Load the chosen font into the page for the live preview.
  useEffect(() => {
    let cancelled = false;
    ensureFont(d.font).then((f) => { if (!cancelled) setFamily(f); }).catch(() => { if (!cancelled) setFamily("serif"); });
    return () => { cancelled = true; };
  }, [d.font]);

  // Keep the design (without the logo) in this browser.
  useEffect(() => {
    const h = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, logo: null })); } catch { /* storage blocked */ }
    }, 400);
    return () => clearTimeout(h);
  }, [d]);

  const previewSvg = useMemo(() => (family && ready ? buildStampSvg(d, { fontFamily: family }) : null), [d, family, ready]);

  // A PNG of the current design for placing on the PDF, refreshed a moment after the design settles.
  useEffect(() => {
    if (!pdf || !ready) return;
    let cancelled = false;
    const h = setTimeout(async () => {
      try {
        const blob = await svgToPng(await exportSvg(d), 1200);
        if (cancelled) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        setStampPng((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), bytes }; });
      } catch { /* the download button reports failures */ }
    }, 300);
    return () => { cancelled = true; clearTimeout(h); };
  }, [d, pdf, ready]);

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_LOGO) { setError(t("logoTooBig")); return; }
    setError(null);
    const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    set("logo", url);
  }

  function today(cal: "hijri" | "gregorian") {
    const now = new Date();
    set("date", cal === "hijri" ? formatHijri(now, locale, "long", defaultDigits(locale)) : formatGregorian(now, locale, "long", defaultDigits(locale)));
  }

  async function download(kind: "png" | "svg") {
    setBusy(kind);
    setError(null);
    try {
      const svg = await exportSvg(d);
      const name = stampFileName(d);
      if (kind === "svg") saveBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
      else saveBlob(await svgToPng(svg, pngWidth), `${name}.png`);
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    if (!pdf || !stampPng) return;
    setBusy("pdf");
    setError(null);
    try {
      const result = await engine.run("stamp-maker", [pdf], { sig: stampPng.bytes, ...placement, allPages }, () => {});
      if (!result.ok) throw new Error(result.message);
      const out = result.outputs[0];
      saveBlob(new Blob([out.bytes as BlobPart], { type: out.mime }), out.name);
    } catch {
      setError(t("pdfFailed"));
    } finally {
      setBusy(null);
    }
  }

  const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const section = (title: string, children: ReactNode) => (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-ink-2">{title}</h2>
      {children}
    </div>
  );

  return (
    <section data-testid="stamp-maker" className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Design panel */}
      <div className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-5">
        {section(t("shape"), (
          <div className="flex gap-2">
            <ShapeButton shape="round" current={d.shape} onPick={(s) => set("shape", s)} label={t("round")} />
            <ShapeButton shape="oval" current={d.shape} onPick={(s) => set("shape", s)} label={t("oval")} />
            <ShapeButton shape="rect" current={d.shape} onPick={(s) => set("shape", s)} label={t("rect")} />
          </div>
        ))}

        {section(t("text"), (
          <div className="flex flex-col gap-3">
            <Field label={t("top")}>{(id) => <TextInput id={id} value={d.top} placeholder={t("topPlaceholder")} onChange={(e) => set("top", e.target.value)} />}</Field>
            <Field label={t("center")}>{(id) => <TextInput id={id} value={d.center} placeholder={t("centerPlaceholder")} onChange={(e) => set("center", e.target.value)} />}</Field>
            <Field label={t("bottom")}>{(id) => <TextInput id={id} value={d.bottom} placeholder={t("bottomPlaceholder")} onChange={(e) => set("bottom", e.target.value)} />}</Field>
            <Field label={t("date")}>
              {(id) => (
                <div className="flex flex-col gap-2">
                  <TextInput id={id} value={d.date} placeholder={t("datePlaceholder")} onChange={(e) => set("date", e.target.value)} />
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button type="button" onClick={() => today("hijri")} className="rounded-md border border-line px-2.5 py-1 font-medium hover:border-ink-3">{t("hijriToday")}</button>
                    <button type="button" onClick={() => today("gregorian")} className="rounded-md border border-line px-2.5 py-1 font-medium hover:border-ink-3">{t("gregorianToday")}</button>
                  </div>
                </div>
              )}
            </Field>
            <Field label={t("font")}>
              {(id) => (
                <select id={id} value={d.font} onChange={(e) => set("font", e.target.value as FontId)} className={inputCls}>
                  {FONTS.map((f) => <option key={f.id} value={f.id}>{f.name[locale]}</option>)}
                </select>
              )}
            </Field>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("textSize")}
              <input type="range" min={60} max={140} value={Math.round(d.scale * 100)} onChange={(e) => set("scale", Number(e.target.value) / 100)} className="accent-lapis" />
            </label>
          </div>
        ))}

        {section(t("look"), (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("color")}</span>
              <div className="flex items-center gap-2">
                {INKS.map((c) => (
                  <button key={c} type="button" aria-label={c} aria-pressed={d.color === c} onClick={() => set("color", c)} className={`size-8 rounded-full border-2 ${d.color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />
                ))}
                <input type="color" value={d.color} aria-label={t("customColor")} onChange={(e) => set("color", e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-line-2 bg-surface p-0.5" />
              </div>
            </div>
            <Field label={t("border")}>
              {(id) => (
                <select id={id} value={d.border} onChange={(e) => set("border", e.target.value as StampBorder)} className={inputCls}>
                  <option value="double">{t("double")}</option>
                  <option value="single">{t("single")}</option>
                  <option value="none">{t("noBorder")}</option>
                </select>
              )}
            </Field>
            <Checkbox checked={d.separators} onChange={(v) => set("separators", v)} label={t("separators")} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("worn")}
              <input type="range" min={0} max={100} value={d.worn} data-testid="stamp-worn" onChange={(e) => set("worn", Number(e.target.value))} className="accent-lapis" />
            </label>
          </div>
        ))}

        {section(t("logo"), (
          <div className="flex flex-col gap-2">
            <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label={t("logo")} data-testid="stamp-logo" onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="flex items-center gap-3">
              {d.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.logo} alt="" className="size-12 rounded-md border border-line object-contain" />
              )}
              <button type="button" onClick={() => logoInput.current?.click()} className={`${btn} border border-line-2 bg-surface hover:border-ink-3`}>{I("M4 19h16M12 4v11M7 9l5-5 5 5")}{d.logo ? t("changeLogo") : t("chooseLogo")}</button>
              {d.logo && <button type="button" onClick={() => set("logo", null)} className="text-sm font-medium text-red">{t("removeLogo")}</button>}
            </div>
            {d.logo && <Checkbox checked={d.logoTint} onChange={(v) => set("logoTint", v)} label={t("logoTint")} />}
          </div>
        ))}
      </div>

      {/* Preview and exports */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          <div
            data-testid="stamp-preview"
            className="grid min-h-[300px] place-items-center rounded-xl bg-[#fbf9f4] p-6 [background-image:radial-gradient(#e3e6ef_1px,transparent_1px)] [background-size:16px_16px]"
          >
            {previewSvg ? (
              <div className="w-full max-w-[420px]" dangerouslySetInnerHTML={{ __html: previewSvg.replace(/ width="\d+" height="\d+"/, ' width="100%" height="auto"') }} />
            ) : (
              <span className="text-sm text-ink-3">{ready ? "…" : t("empty")}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" data-testid="export-png" disabled={!ready || busy !== null} onClick={() => download("png")} className={`${btn} bg-lapis text-white hover:bg-lapis-deep`}>{I("M12 4v11M7 10l5 5 5-5M5 20h14")}{busy === "png" ? t("working") : t("downloadPng")}</button>
            <select value={pngWidth} aria-label={t("pngSize")} onChange={(e) => setPngWidth(Number(e.target.value))} className={`${inputCls} w-auto`}>
              {PNG_WIDTHS.map((w) => <option key={w} value={w}>{w} px</option>)}
            </select>
            <button type="button" data-testid="export-svg" disabled={!ready || busy !== null} onClick={() => download("svg")} className={`${btn} border border-line-2 bg-surface hover:border-ink-3`}>{busy === "svg" ? t("working") : t("downloadSvg")}</button>
          </div>
          <p className="text-xs text-ink-2">{t("privacy")}</p>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{t("placeTitle")}</h2>
            <p className="text-sm text-ink-2">{t("placeHint")}</p>
          </div>
          <input ref={pdfInput} type="file" accept="application/pdf" className="sr-only" aria-label={t("choosePdf")} data-testid="stamp-pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPdf(f); setStampPng(null); } e.target.value = ""; }} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => pdfInput.current?.click()} className={`${btn} border border-line-2 bg-surface hover:border-ink-3`}>{I("M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5")}{pdf ? t("changePdf") : t("choosePdf")}</button>
            {pdf && <span className="min-w-0 truncate text-sm text-ink-2">{pdf.name}</span>}
          </div>
          {pdf && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <PagePlacer file={pdf} imageUrl={stampPng?.url ?? null} ratio={ratio} value={placement} onChange={setPlacement} imageAlt={t("placedAlt")} hint={t("placeHint")} />
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t("stampSize")}
                  <input type="range" min={10} max={60} value={Math.round(placement.w * 100)} onChange={(e) => setPlacement({ ...placement, w: Number(e.target.value) / 100 })} className="accent-lapis" />
                </label>
                <Checkbox checked={allPages} onChange={setAllPages} label={t("allPages")} />
                <button type="button" data-testid="stamp-pdf-download" disabled={!ready || !stampPng || busy !== null} onClick={downloadPdf} className={`${btn} bg-lapis text-white hover:bg-lapis-deep`}>{busy === "pdf" ? t("working") : t("downloadPdf")}</button>
              </div>
            </div>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg bg-[#fdecea] px-4 py-3 text-sm text-red">{error}</p>}
        <p className="text-xs text-ink-2">{t("notice")}</p>
        <span className="sr-only">{tool.copy[locale].name}</span>
      </div>
    </section>
  );
}

export const stampMaker: ToolModule = {
  defaults: {},
  Standalone: StampMaker,
};
