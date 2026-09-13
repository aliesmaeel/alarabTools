/**
 * Markdown for the editor tool: one markdown-it instance shared by the live preview, the HTML and
 * print exports, and the Word writer, so every output agrees with what the visitor sees.
 *
 * Raw HTML in the source is escaped (html: false), so the preview can be injected safely; markdown-it
 * also refuses javascript:, vbscript: and file: links.
 */
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
export const hasRtl = (s: string) => RTL.test(s);

/** Block tags that get dir="auto" so each paragraph, heading or cell follows its own first strong letter. */
const AUTO_DIR = new Set(["paragraph_open", "heading_open", "list_item_open", "blockquote_open", "th_open", "td_open", "bullet_list_open", "ordered_list_open"]);

function createMd(): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false });
  // Bare domains link only for common suffixes. The default list includes every two-letter country code,
  // which turns file names such as "notes.md" (Moldova) or "setup.py" (Paraguay) into links.
  md.linkify.set({ fuzzyEmail: false }).tlds(
    ["com", "net", "org", "info", "io", "dev", "app", "ai", "co", "edu", "gov", "me", "tv", "sa", "ae", "eg", "jo", "kw", "qa", "bh", "om", "ma", "dz", "tn", "lb", "iq", "sy", "ps", "sd", "ly", "ye", "uk", "us", "de", "fr", "tr"],
    false,
  );

  md.core.ruler.push("alarab_dir_and_tasks", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (AUTO_DIR.has(tok.type)) tok.attrSet("dir", "auto");
      if (tok.type === "fence" || tok.type === "code_block") tok.attrSet("dir", "ltr");
      // GitHub task lists: "- [ ] todo" / "- [x] done".
      if (tok.type === "inline" && tokens[i - 1]?.type === "paragraph_open" && tokens[i - 2]?.type === "list_item_open") {
        const first = tok.children?.[0];
        const m = first?.type === "text" ? /^\[([ xX])\]\s+/.exec(first.content) : null;
        if (first && m) {
          first.content = first.content.slice(m[0].length);
          const box = new state.Token("html_inline", "", 0);
          box.content = `<input type="checkbox" disabled${m[1] === " " ? "" : " checked"}> `;
          tok.children!.unshift(box);
          tokens[i - 2].attrJoin("class", "task");
          tokens[i - 2].meta = { ...(tokens[i - 2].meta ?? {}), task: m[1] !== " " };
        }
      }
    }
  });

  // External links open in a new tab without handing over window.opener.
  const linkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet("href") ?? "";
    if (/^https?:/i.test(href)) {
      tokens[idx].attrSet("target", "_blank");
      tokens[idx].attrSet("rel", "noopener noreferrer");
    }
    return linkOpen(tokens, idx, options, env, self);
  };
  // Wide tables scroll inside their own box instead of pushing the page sideways.
  md.renderer.rules.table_open = (tokens, idx, options, _env, self) => `<div class="table-wrap">${self.renderToken(tokens, idx, options)}`;
  md.renderer.rules.table_close = (tokens, idx, options, _env, self) => `${self.renderToken(tokens, idx, options)}</div>`;
  return md;
}

let instance: MarkdownIt | null = null;
export function md(): MarkdownIt {
  instance ??= createMd();
  return instance;
}

export const renderMarkdown = (src: string) => md().render(src);
export const parseMarkdown = (src: string): Token[] => md().parse(src, {});

/** First heading, else the first non-empty line: used for titles and file names. */
export function titleOf(src: string, fallback = "document"): string {
  const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m.exec(src);
  const line = h?.[1] ?? src.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  const clean = line.replace(/[*_`~[\]()<>#]/g, "").trim().slice(0, 80);
  return clean || fallback;
}

export function stats(src: string) {
  const words = src.trim() ? src.trim().split(/\s+/).length : 0;
  return { chars: src.length, words, lines: src ? src.split(/\r?\n/).length : 0 };
}

/** Shared stylesheet for the preview, the HTML export and printing. Scoped to `.md-doc`. */
export const DOC_CSS = `
.md-doc{font-size:16px;line-height:1.75;color:#161b2f;overflow-wrap:anywhere}
.md-doc>:first-child{margin-top:0}
.md-doc h1,.md-doc h2,.md-doc h3,.md-doc h4,.md-doc h5,.md-doc h6{line-height:1.3;font-weight:700;margin:1.6em 0 .6em;text-wrap:balance}
.md-doc h1{font-size:2em}.md-doc h2{font-size:1.5em;padding-bottom:.25em;border-bottom:1px solid #e3e6ef}
.md-doc h3{font-size:1.25em}.md-doc h4{font-size:1.1em}.md-doc h5,.md-doc h6{font-size:1em;color:#4a5068}
.md-doc p,.md-doc ul,.md-doc ol,.md-doc blockquote,.md-doc pre,.md-doc .table-wrap{margin:0 0 1em}
.md-doc ul,.md-doc ol{padding-inline-start:1.6em}.md-doc ul{list-style:disc}.md-doc ol{list-style:decimal}.md-doc ul ul{list-style:circle}.md-doc ul ul ul{list-style:square}
.md-doc li+li{margin-top:.25em}.md-doc li>ul,.md-doc li>ol{margin:.25em 0 0}.md-doc li::marker{color:#5c627a}
.md-doc li.task{list-style:none;margin-inline-start:-1.4em}.md-doc li.task input{margin-inline-end:.45em;vertical-align:middle}
.md-doc a{color:#3346b8;text-decoration:underline;text-underline-offset:2px}
.md-doc blockquote{margin-inline:0;padding:.4em 1em;border-inline-start:4px solid #c9cedd;color:#4a5068;background:#f5f7fe;border-radius:0 6px 6px 0}
.md-doc code{font-family:ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:.88em;background:#eceef4;padding:.12em .38em;border-radius:4px;direction:ltr;unicode-bidi:isolate}
.md-doc pre{background:#161b2f;color:#e9ecfa;padding:14px 16px;border-radius:8px;overflow:auto;line-height:1.55;text-align:left}
.md-doc pre code{background:none;padding:0;color:inherit;font-size:.86em}
.md-doc hr{border:0;border-top:1px solid #d7dbe7;margin:2em 0}
.md-doc img{max-width:100%;height:auto;border-radius:6px}
.md-doc .table-wrap{overflow-x:auto}
.md-doc table{border-collapse:collapse;min-width:50%;font-size:.95em}
.md-doc th,.md-doc td{border:1px solid #d7dbe7;padding:.45em .75em;text-align:start;vertical-align:top}
.md-doc th{background:#f0f2f7;font-weight:600}
.md-doc tr:nth-child(even) td{background:#fafbfd}
`;

/** A complete, self-contained HTML document (for the .html download and for printing to PDF). */
export function htmlDocument(src: string, o: { title: string; lang: "ar" | "en"; fontBase?: string; print?: boolean }): string {
  const body = renderMarkdown(src);
  const dir = hasRtl(src.slice(0, 2000)) && o.lang === "ar" ? "rtl" : hasRtl(src.slice(0, 400)) ? "rtl" : "ltr";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fonts = o.fontBase
    ? `@font-face{font-family:"Tajawal";src:url("${o.fontBase}/fonts/tajawal-Tajawal-Regular.ttf") format("truetype");font-weight:400;font-display:swap}
@font-face{font-family:"Tajawal";src:url("${o.fontBase}/fonts/tajawal-Tajawal-Bold.ttf") format("truetype");font-weight:700;font-display:swap}`
    : "";
  const print = o.print
    ? `@page{size:A4;margin:18mm 16mm}
html,body{background:#fff}
.md-doc{font-size:11.5pt}
.md-doc pre,.md-doc blockquote,.md-doc table,.md-doc img{break-inside:avoid}
.md-doc h1,.md-doc h2,.md-doc h3{break-after:avoid}
.md-doc pre{white-space:pre-wrap;background:#f4f5f8;color:#161b2f;border:1px solid #e3e6ef}
.md-doc a{color:#161b2f}
.md-doc .table-wrap{overflow:visible}`
    : `body{max-width:820px;margin:0 auto;padding:40px 20px}`;
  return `<!doctype html>
<html lang="${o.lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<style>
${fonts}
body{margin:0;font-family:Tajawal,"IBM Plex Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif;background:#fff}
${DOC_CSS}
${print}
</style>
</head>
<body><article class="md-doc">${body}</article></body>
</html>`;
}
