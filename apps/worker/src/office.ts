/**
 * Minimal Office writers (DOCX and XLSX are zipped XML). Enough for text and tables; no styles beyond
 * paragraph direction, which matters for Arabic.
 */
import { zipSync, strToU8 } from "fflate";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isRtl = (s: string) => /[؀-ۿ]/.test(s);
const CT = (extra: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${extra}</Types>`;
const RELS = (target: string, type: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`;

/** One paragraph per line; blank lines separate paragraphs. Arabic paragraphs are right-to-left. */
export function docx(paragraphs: string[], font = "Arial"): Uint8Array {
  const body = paragraphs.map((p) => {
    const rtl = isRtl(p);
    return `<w:p><w:pPr>${rtl ? '<w:bidi/><w:jc w:val="right"/>' : ""}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${rtl ? "<w:rtl/>" : ""}</w:rPr><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`;
  }).join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(CT('<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>')),
    "_rels/.rels": strToU8(RELS("word/document.xml", "officeDocument")),
    "word/document.xml": strToU8(document),
  }, { level: 6 });
}

/** Rows of cells as inline strings; numbers stay numbers. */
export function xlsx(rows: string[][], sheetName = "Sheet1"): Uint8Array {
  const col = (i: number) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const rtl = rows.some((r) => r.some(isRtl));
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
    const ref = `${col(ci)}${ri + 1}`;
    const num = c.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/,/g, "");
    if (/^-?\d+(\.\d+)?$/.test(num)) return `<c r="${ref}"><v>${num}</v></c>`;
    return c === "" ? "" : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(c)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ""}/></sheetViews><sheetData>${body}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  return zipSync({
    "[Content_Types].xml": strToU8(CT('<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')),
    "_rels/.rels": strToU8(RELS("xl/workbook.xml", "officeDocument")),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(RELS("worksheets/sheet1.xml", "worksheet")),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  }, { level: 6 });
}

/** Split `pdftotext -layout` lines into cells on runs of two or more spaces. */
export function layoutToRows(text: string): string[][] {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.trim().split(/\s{2,}/));
}
