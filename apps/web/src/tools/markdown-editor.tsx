"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ToolDef } from "@alarab/tools";
import type { ToolModule } from "./types";
import { htmlDocument, renderMarkdown, stats, titleOf, DOC_CSS } from "@/lib/markdown";
import { saveBlob } from "@/lib/download";

const DRAFT_KEY = "alarab:markdown:draft";
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".md,.markdown,.mdown,.mkd,.mdx,.txt,text/markdown,text/plain";

const SAMPLE_AR = `# دليل سريع لـ Markdown

اكتب هنا وسترى **المعاينة** مباشرة على الجانب الآخر. يدعم المحرر العربية والإنجليزية في الملف نفسه، ويأخذ كل سطر اتجاهه من أول حرف فيه.

## القوائم

- عنصر أول
- عنصر ثانٍ مع \`كود قصير\`
  - عنصر فرعي

1. افتح ملف ‎.md
2. عدّل النص
3. صدّره PDF أو Word

- [x] مهمة منجزة
- [ ] مهمة قادمة

## جدول

| الأداة | التشغيل | الحد |
|---|---|---|
| دمج PDF | في المتصفح | ٢٥ ميغابايت |
| OCR | على الخادم | ٥٠ صفحة |

> الملفات تبقى على جهازك في هذه الأداة، ولا يُرفع أي شيء.

\`\`\`js
const hello = "مرحبا";
console.log(hello);
\`\`\`

English lines work too: [alarabTools](https://example.com) keeps them left to right.
`;

const SAMPLE_EN = `# Markdown quick guide

Type here and the **preview** updates as you go. Arabic and English can share a file: every line takes its direction from its first letter.

## Lists

- First item
- Second item with \`inline code\`
  - Nested item

1. Open a .md file
2. Edit the text
3. Export to PDF or Word

- [x] Done task
- [ ] Next task

## Table

| Tool | Runs | Limit |
|---|---|---|
| Merge PDF | In the browser | 25 MB |
| OCR | On the server | 50 pages |

> Files stay on your device in this tool; nothing is uploaded.

\`\`\`js
const hello = "Hello";
console.log(hello);
\`\`\`

سطر عربي أيضًا يظهر من اليمين إلى اليسار.
`;

type Snippet = { key: string; icon: ReactNode; apply: (sel: string) => { text: string; select?: [number, number] } };
const I = (d: string) => <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden className="fill-none stroke-current stroke-[1.9]" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

const SNIPPETS: Snippet[] = [
  { key: "heading", icon: I("M6 4v16M18 4v16M6 12h12"), apply: (s) => ({ text: `## ${s || "Heading"}` }) },
  { key: "bold", icon: I("M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"), apply: (s) => ({ text: `**${s || "bold"}**`, select: [2, 2 + (s || "bold").length] }) },
  { key: "italic", icon: I("M10 4h8M6 20h8M14 4l-4 16"), apply: (s) => ({ text: `*${s || "italic"}*`, select: [1, 1 + (s || "italic").length] }) },
  { key: "link", icon: I("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"), apply: (s) => ({ text: `[${s || "text"}](https://)`, select: [(s || "text").length + 3, (s || "text").length + 11] }) },
  { key: "bullets", icon: I("M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"), apply: (s) => ({ text: (s || "item").split("\n").map((l) => `- ${l}`).join("\n") }) },
  { key: "numbers", icon: I("M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 15h2l-2 3h2"), apply: (s) => ({ text: (s || "item").split("\n").map((l, i) => `${i + 1}. ${l}`).join("\n") }) },
  { key: "quote", icon: I("M7 7h4v4H8c0 3 1 4 3 5M15 7h4v4h-3c0 3 1 4 3 5"), apply: (s) => ({ text: (s || "quote").split("\n").map((l) => `> ${l}`).join("\n") }) },
  { key: "code", icon: I("M9 8l-5 4 5 4M15 8l5 4-5 4"), apply: (s) => (s.includes("\n") ? { text: "```\n" + s + "\n```" } : { text: `\`${s || "code"}\``, select: [1, 1 + (s || "code").length] }) },
  { key: "table", icon: I("M4 5h16v14H4zM4 10h16M4 15h16M10 5v14"), apply: () => ({ text: "| Column | Column |\n|---|---|\n| Cell | Cell |" }) },
];

function IconButton({ label, onClick, children, active, testId }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} data-testid={testId} className={`grid size-8 shrink-0 place-items-center rounded-md transition-colors ${active ? "bg-lapis-soft text-lapis-deep" : "text-ink-2 hover:bg-ground hover:text-ink"}`}>
      {children}
    </button>
  );
}

function readDraft(locale: string): { text: string; name: string } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as { text?: string; name?: string };
      if (typeof d.text === "string") return { text: d.text, name: d.name || "" };
    }
  } catch { /* storage blocked */ }
  return { text: locale === "ar" ? SAMPLE_AR : SAMPLE_EN, name: "" };
}

function MarkdownEditor({ tool }: { tool: ToolDef }) {
  const t = useTranslations("markdown");
  const locale = useLocale() as "ar" | "en";
  const [initial] = useState(() => readDraft(locale));
  const [text, setText] = useState(initial.text);
  const [fileName, setFileName] = useState(initial.name);
  const [view, setView] = useState<"preview" | "html">("preview");
  const [mobileTab, setMobileTab] = useState<"write" | "preview">("write");
  const [dir, setDir] = useState<"auto" | "rtl" | "ltr">("auto");
  const [full, setFull] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const html = useMemo(() => renderMarkdown(text), [text]);
  const s = stats(text);
  const baseName = (fileName.replace(/\.[^.]+$/, "") || titleOf(text, "document")).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);

  // Save the draft in this browser, a moment after typing stops.
  useEffect(() => {
    const h = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, name: fileName })); } catch { /* storage blocked */ }
    }, 400);
    return () => clearTimeout(h);
  }, [text, fileName]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(h);
  }, [toast]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [full]);

  async function openFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) { setError(t("tooBig")); return; }
    if (!/\.(md|markdown|mdown|mkd|mdx|txt)$/i.test(file.name) && !/^text\//.test(file.type)) { setError(t("notMarkdown")); return; }
    const content = (await file.text()).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    setText(content);
    setFileName(file.name);
    setMobileTab("preview");
    setToast(t("opened", { name: file.name }));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void openFile(e.dataTransfer.files[0]);
  }

  function insert(sn: Snippet) {
    const el = area.current;
    if (!el) return;
    const start = el.selectionStart, end = el.selectionEnd;
    const selected = text.slice(start, end);
    const { text: piece, select } = sn.apply(selected);
    // Block snippets start on their own line.
    const block = ["heading", "bullets", "numbers", "quote", "table"].includes(sn.key) || piece.startsWith("```");
    const before = text.slice(0, start);
    const lead = block && before && !before.endsWith("\n") ? "\n" : "";
    const next = before + lead + piece + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const at = start + lead.length;
      if (select) el.setSelectionRange(at + select[0], at + select[1]);
      else el.setSelectionRange(at + piece.length, at + piece.length);
    });
  }

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast(message);
    } catch {
      setToast(t("copyFailed"));
    }
  }

  function download(kind: "md" | "html" | "docx") {
    if (kind === "md") saveBlob(new Blob([text], { type: "text/markdown;charset=utf-8" }), `${baseName}.md`);
    if (kind === "html") saveBlob(new Blob([htmlDocument(text, { title: baseName, lang: locale, fontBase: location.origin })], { type: "text/html;charset=utf-8" }), `${baseName}.html`);
    if (kind === "docx") {
      void import("@/lib/markdown-docx").then(({ markdownToDocx }) => {
        const bytes = markdownToDocx(text, baseName);
        saveBlob(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `${baseName}.docx`);
      });
    }
  }

  /** Print a clean copy in a hidden frame; the browser's dialog offers "Save as PDF" and keeps Arabic shaping intact. */
  function printPdf() {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.dataset.testid = "print-frame";
    Object.assign(frame.style, { position: "fixed", insetInlineEnd: "0", bottom: "0", width: "0", height: "0", border: "0" });
    frame.srcdoc = htmlDocument(text, { title: baseName, lang: locale, fontBase: location.origin, print: true });
    frame.onload = async () => {
      const win = frame.contentWindow;
      if (!win) return;
      try { await win.document.fonts.ready; } catch { /* older browsers */ }
      win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500));
      win.focus();
      win.print();
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
    setToast(t("printHint"));
  }

  function syncScroll() {
    const a = area.current, p = preview.current;
    if (!a || !p || view !== "preview") return;
    const ratio = a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight);
    p.scrollTop = ratio * (p.scrollHeight - p.clientHeight);
  }

  const exportBtn = "inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors";
  const paneHead = "flex h-11 items-center justify-between gap-2 border-b border-line px-3";

  return (
    <section
      data-testid="markdown-editor"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
      className={`relative flex flex-col overflow-hidden border border-line bg-surface ${full ? "fixed inset-0 z-50 rounded-none" : "rounded-2xl"}`}
    >
      {/* File bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ground/50 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-2 bg-surface px-3.5 text-sm font-medium hover:border-ink-3">
            {I("M4 19h16M12 4v11M7 9l5-5 5 5")}
            {t("open")}
          </button>
          <input ref={fileInput} type="file" accept={ACCEPT} className="sr-only" aria-label={t("open")} data-testid="md-file" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="min-w-0 truncate text-sm text-ink-2" title={fileName || undefined}>
            {fileName || t("untitled")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={printPdf} data-testid="export-pdf" className={`${exportBtn} bg-lapis text-white hover:bg-lapis-deep`}>{I("M7 3h7l5 5v13H7zM14 3v5h5")}PDF</button>
          <button type="button" onClick={() => download("docx")} data-testid="export-docx" className={`${exportBtn} bg-teal text-white hover:bg-teal-deep`}>{I("M7 3h7l5 5v13H7zM9 12l1.5 5L12 13l1.5 4L15 12")}Word</button>
          <button type="button" onClick={() => download("html")} data-testid="export-html" className={`${exportBtn} border border-line-2 bg-surface hover:border-ink-3`}>HTML</button>
          <button type="button" onClick={() => download("md")} data-testid="export-md" className={`${exportBtn} border border-line-2 bg-surface hover:border-ink-3`}>.md</button>
        </div>
      </div>

      {/* Mobile tabs */}
      <div role="tablist" className="grid grid-cols-2 border-b border-line lg:hidden">
        {(["write", "preview"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={mobileTab === k} onClick={() => setMobileTab(k)} className={`h-11 text-sm font-medium ${mobileTab === k ? "border-b-2 border-lapis text-lapis-deep" : "text-ink-2"}`}>{t(k)}</button>
        ))}
      </div>

      <div className={`grid lg:grid-cols-2 ${full ? "min-h-0 flex-1" : ""}`}>
        {/* Editor */}
        <div className={`flex min-w-0 flex-col border-line lg:border-e ${mobileTab === "write" ? "" : "hidden lg:flex"}`}>
          <div className={paneHead}>
            <div className="flex items-center gap-0.5 overflow-x-auto" role="toolbar" aria-label={t("format")}>
              {SNIPPETS.map((sn) => <IconButton key={sn.key} label={t(`snippet.${sn.key}`)} onClick={() => insert(sn)}>{sn.icon}</IconButton>)}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton label={t(`dir.${dir}`)} onClick={() => setDir(dir === "auto" ? "rtl" : dir === "rtl" ? "ltr" : "auto")} active={dir !== "auto"}>
                <span className="text-[11px] font-bold">{dir === "auto" ? "⇄" : dir === "rtl" ? "←" : "→"}</span>
              </IconButton>
              <IconButton label={t("copyMd")} onClick={() => copy(text, t("copied"))}>{I("M9 9h11v11H9zM5 15H4V4h11v1")}</IconButton>
              <IconButton label={t("sample")} onClick={() => { setText(locale === "ar" ? SAMPLE_AR : SAMPLE_EN); setFileName(""); }}>{I("M4 4h16v16H4zM8 9h8M8 13h8M8 17h5")}</IconButton>
              <IconButton label={t("clear")} testId="md-clear" onClick={() => { if (!text || confirm(t("clearConfirm"))) { setText(""); setFileName(""); area.current?.focus(); } }}>{I("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3")}</IconButton>
            </div>
          </div>
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onScroll={syncScroll}
            dir={dir}
            spellCheck={false}
            aria-label={t("editorLabel")}
            data-testid="md-input"
            placeholder={t("placeholder")}
            className={`w-full flex-1 resize-none bg-surface p-4 font-mono text-[14px] leading-7 text-ink outline-none ${full ? "h-full" : "h-[62vh] min-h-[420px]"}`}
          />
          <div className="flex h-9 items-center justify-between border-t border-line px-3 text-xs text-ink-2 tabular-nums">
            <span>{t("stats", { chars: s.chars, words: s.words, lines: s.lines })}</span>
            <span>{t("draftSaved")}</span>
          </div>
        </div>

        {/* Preview */}
        <div className={`flex min-w-0 flex-col ${mobileTab === "preview" ? "" : "hidden lg:flex"}`}>
          <div className={paneHead}>
            <div role="tablist" className="flex items-center gap-1 rounded-md bg-ground p-0.5">
              {(["preview", "html"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`h-7 rounded px-2.5 text-xs font-medium ${view === k ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}>{t(`view.${k}`)}</button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              <IconButton label={t("copyHtml")} onClick={() => copy(html, t("copied"))}>{I("M9 9h11v11H9zM5 15H4V4h11v1")}</IconButton>
              <IconButton label={full ? t("exitFull") : t("full")} onClick={() => setFull(!full)} active={full}>{full ? I("M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5") : I("M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5")}</IconButton>
            </div>
          </div>
          <div ref={preview} className={`overflow-auto bg-surface ${full ? "min-h-0 flex-1" : "h-[62vh] min-h-[420px]"}`}>
            {view === "preview" ? (
              text.trim() ? (
                <article data-testid="md-preview" className="md-doc mx-auto max-w-[760px] px-5 py-6 sm:px-8" dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <div className="grid h-full place-items-center p-8 text-center text-sm text-ink-3">{t("empty")}</div>
              )
            ) : (
              <pre dir="ltr" className="whitespace-pre-wrap break-words p-4 font-mono text-[12.5px] leading-6 text-ink-2">{html}</pre>
            )}
          </div>
          <div className="flex h-9 items-center justify-between border-t border-line px-3 text-xs text-ink-2">
            <span>{t("privacy")}</span>
            <span className="hidden sm:inline">{t("dropHint")}</span>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="border-t border-line bg-[#fdecea] px-4 py-2.5 text-sm text-red">{error}</p>}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-lapis/10 backdrop-blur-[1px]">
          <div className="rounded-xl border-2 border-dashed border-lapis bg-surface px-6 py-4 text-sm font-semibold text-lapis-deep">{t("dropHere")}</div>
        </div>
      )}
      {toast && (
        <div role="status" className="pointer-events-none absolute bottom-12 start-1/2 z-20 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg rtl:translate-x-1/2">{toast}</div>
      )}
      <style>{DOC_CSS}</style>
      <span className="sr-only">{tool.copy[locale].name}</span>
    </section>
  );
}

export const markdownEditor: ToolModule = {
  defaults: {},
  Standalone: MarkdownEditor,
};
