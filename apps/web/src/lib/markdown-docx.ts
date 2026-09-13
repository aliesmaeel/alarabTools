/**
 * Markdown to DOCX in the browser. Walks the markdown-it token stream and writes WordprocessingML:
 * headings, paragraphs with bold/italic/strike/code/links, bullet and numbered lists (nested),
 * task lists, block quotes, code blocks, tables and horizontal rules. Paragraphs and table rows that
 * contain Arabic are right-to-left.
 */
import { strToU8, zipSync } from "fflate";
import type Token from "markdown-it/lib/token.mjs";
import { hasRtl, parseMarkdown } from "./markdown";

type Mark = { b?: boolean; i?: boolean; s?: boolean; code?: boolean; link?: string };
type Run = { text: string; mark: Mark } | { br: true };

const FONT = "Arial";
const MONO = "Consolas";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Characters XML 1.0 forbids (control chars other than tab/newline/CR).
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");

class Writer {
  body: string[] = [];
  rels: string[] = [];
  private relId = 1;

  link(href: string): string {
    const id = `rIdL${this.relId++}`;
    this.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`);
    return id;
  }

  runsXml(runs: Run[], base: { size: number; bold?: boolean; color?: string; italic?: boolean; rtlPara?: boolean }): string {
    const out: string[] = [];
    for (const r of runs) {
      if ("br" in r) { out.push("<w:r><w:br/></w:r>"); continue; }
      if (!r.text) continue;
      const m = r.mark;
      // In a right-to-left paragraph, runs with no Latin letters (list numbers, punctuation, digits) are
      // right-to-left too, otherwise Word places "1. " on the left of an Arabic list item.
      const rtl = hasRtl(r.text) || (!!base.rtlPara && !m.code && !/[A-Za-z]/.test(r.text));
      const font = m.code ? MONO : FONT;
      const props = [
        `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>`,
        m.b || base.bold ? "<w:b/><w:bCs/>" : "",
        m.i || base.italic ? "<w:i/><w:iCs/>" : "",
        m.s ? "<w:strike/>" : "",
        m.link ? '<w:color w:val="3346B8"/><w:u w:val="single"/>' : base.color ? `<w:color w:val="${base.color}"/>` : "",
        `<w:sz w:val="${m.code ? base.size - 2 : base.size}"/><w:szCs w:val="${m.code ? base.size - 2 : base.size}"/>`,
        m.code ? '<w:shd w:val="clear" w:color="auto" w:fill="ECEEF4"/>' : "",
        rtl ? "<w:rtl/>" : "",
      ].join("");
      const run = `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(clean(r.text))}</w:t></w:r>`;
      out.push(m.link ? `<w:hyperlink r:id="${this.link(m.link)}">${run}</w:hyperlink>` : run);
    }
    return out.join("");
  }

  paragraph(runs: Run[], o: { size?: number; bold?: boolean; color?: string; italic?: boolean; indent?: number; before?: number; after?: number; shade?: string; rtl?: boolean; keepNext?: boolean; borderBottom?: boolean; mono?: boolean }): string {
    const text = runs.map((r) => ("text" in r ? r.text : "")).join("");
    const rtl = o.rtl ?? hasRtl(text);
    const pPr = [
      o.keepNext ? "<w:keepNext/>" : "",
      o.borderBottom ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D7DBE7"/></w:pBdr>' : "",
      o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : "",
      `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 160}" w:line="${o.mono ? 260 : 300}" w:lineRule="auto"/>`,
      o.indent ? `<w:ind w:left="${rtl ? 0 : o.indent}" w:right="${rtl ? o.indent : 0}"/>` : "",
      rtl ? "<w:bidi/>" : "",
    ].join("");
    return `<w:p><w:pPr>${pPr}</w:pPr>${this.runsXml(runs, { size: o.size ?? 22, bold: o.bold, color: o.color, italic: o.italic, rtlPara: rtl })}</w:p>`;
  }

  table(rows: { header: boolean; cells: Run[][] }[]): string {
    const cols = Math.max(1, ...rows.map((r) => r.cells.length));
    const anyRtl = rows.some((r) => r.cells.some((c) => hasRtl(c.map((x) => ("text" in x ? x.text : "")).join(""))));
    const width = Math.floor(9000 / cols);
    const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9CEDD"/>`;
    const tblPr = `<w:tblPr>${anyRtl ? "<w:bidiVisual/>" : ""}<w:tblW w:w="0" w:type="auto"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
    const grid = `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`;
    const trs = rows.map((r) => {
      const cells = Array.from({ length: cols }, (_, i) => r.cells[i] ?? []);
      return `<w:tr>${r.header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${r.header ? '<w:shd w:val="clear" w:color="auto" w:fill="F0F2F7"/>' : ""}</w:tcPr>${this.paragraph(c, { bold: r.header, after: 0, size: 21 })}</w:tc>`).join("")}</w:tr>`;
    }).join("");
    return `<w:tbl>${tblPr}${grid}${trs}</w:tbl>${this.paragraph([], { after: 120 })}`;
  }
}

function inlineRuns(tok: Token): Run[] {
  const runs: Run[] = [];
  const mark: Mark = {};
  for (const c of tok.children ?? []) {
    switch (c.type) {
      case "text": runs.push({ text: c.content, mark: { ...mark } }); break;
      case "code_inline": runs.push({ text: c.content, mark: { ...mark, code: true } }); break;
      case "softbreak": runs.push({ text: " ", mark: { ...mark } }); break;
      case "hardbreak": runs.push({ br: true }); break;
      case "strong_open": mark.b = true; break;
      case "strong_close": mark.b = false; break;
      case "em_open": mark.i = true; break;
      case "em_close": mark.i = false; break;
      case "s_open": mark.s = true; break;
      case "s_close": mark.s = false; break;
      case "link_open": { const href = c.attrGet("href") ?? ""; if (/^(https?:|mailto:)/i.test(href)) mark.link = href; break; }
      case "link_close": mark.link = undefined; break;
      case "image": runs.push({ text: `[${c.content || c.attrGet("alt") || "image"}]`, mark: { ...mark, i: true } }); break;
      case "html_inline": if (/type="checkbox"/.test(c.content)) runs.push({ text: /checked/.test(c.content) ? "☑ " : "☐ ", mark: {} }); break;
      default: if (c.content) runs.push({ text: c.content, mark: { ...mark } });
    }
  }
  return runs;
}

const HEADING_SIZE: Record<string, number> = { h1: 40, h2: 32, h3: 28, h4: 24, h5: 22, h6: 22 };

export function markdownToDocx(src: string, title = "document"): Uint8Array {
  const tokens = parseMarkdown(src);
  const w = new Writer();
  const lists: { ordered: boolean; n: number }[] = [];
  let itemFirstPara = false;
  let quote = 0;
  let heading: string | null = null;
  let table: { header: boolean; cells: Run[][] }[] | null = null;
  let inHead = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case "heading_open": heading = t.tag; break;
      case "heading_close": heading = null; break;
      case "bullet_list_open": lists.push({ ordered: false, n: 0 }); break;
      case "ordered_list_open": lists.push({ ordered: true, n: Number(t.attrGet("start") ?? 1) - 1 }); break;
      case "bullet_list_close":
      case "ordered_list_close": lists.pop(); if (!lists.length) w.body.push(w.paragraph([], { after: 60 })); break;
      case "list_item_open": { const l = lists[lists.length - 1]; if (l) l.n++; itemFirstPara = true; break; }
      case "blockquote_open": quote++; break;
      case "blockquote_close": quote--; break;
      case "table_open": table = []; break;
      case "thead_open": inHead = true; break;
      case "thead_close": inHead = false; break;
      case "tr_open": table?.push({ header: inHead, cells: [] }); break;
      case "table_close": if (table) w.body.push(w.table(table)); table = null; break;
      case "hr": w.body.push(w.paragraph([], { borderBottom: true, after: 240, before: 120 })); break;
      case "fence":
      case "code_block": {
        const lines = t.content.replace(/\n$/, "").split("\n");
        const runs: Run[] = [];
        lines.forEach((line, k) => { if (k) runs.push({ br: true }); runs.push({ text: line || " ", mark: { code: true } }); });
        w.body.push(w.paragraph(runs, { shade: "F4F5F8", rtl: false, indent: lists.length * 360, after: 200, mono: true, size: 20 }));
        break;
      }
      case "inline": {
        const runs = inlineRuns(t);
        if (table) {
          const row = table[table.length - 1];
          row?.cells.push(runs);
          break;
        }
        if (heading) {
          w.body.push(w.paragraph(runs, { size: HEADING_SIZE[heading] ?? 24, bold: true, before: heading === "h1" ? 120 : 280, after: 120, keepNext: true, borderBottom: heading === "h2", color: "161B2F" }));
          break;
        }
        const depth = lists.length;
        if (depth && itemFirstPara) {
          const l = lists[depth - 1];
          const task = t.children?.[0]?.type === "html_inline";
          const bullet = task ? "" : l.ordered ? `${l.n}. ` : depth % 2 ? "• " : "◦ ";
          runs.unshift({ text: bullet, mark: {} });
          itemFirstPara = false;
        }
        w.body.push(w.paragraph(runs, {
          indent: depth * 360 + quote * 480,
          after: depth ? 60 : 160,
          color: quote ? "4A5068" : undefined,
          italic: quote > 0,
        }));
        break;
      }
    }
  }

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${w.body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>alarabTools</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`;
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "word/document.xml": strToU8(document),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${w.rels.join("")}</Relationships>`),
    "docProps/core.xml": strToU8(core),
  }, { level: 6 });
}
