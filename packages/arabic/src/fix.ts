/**
 * Repairs Arabic text damaged by PDF extraction and PDF→Word conversion:
 * - presentation forms (ﺍﻟﺴﻼﻡ) back to plain letters, so search and spell-check work;
 * - stray bidi control characters removed;
 * - lines stored in visual order (every word reversed and the word order flipped) put back;
 * - numbers and Latin words that were flipped inside Arabic lines put back.
 * Heuristics, so the tool page says which fixes were applied.
 */

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const PRESENTATION = /[ﭐ-﷿ﹰ-﻿]/;
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;
/** Tatweel is decorative; NFKC keeps it, so strip it separately. */
const TATWEEL = /ـ/g;
const LTR_RUN = /[0-9A-Za-z٠-٩۰-۹][0-9A-Za-z٠-٩۰-۹.,:/%\-+]*[0-9A-Za-z٠-٩۰-۹]|[0-9A-Za-z٠-٩۰-۹]/g;

export type FixOptions = {
  /** Reverse digit and Latin runs inside Arabic lines (LibreOffice's PDF import flips them). Default: auto-detect. */
  reverseLtrRuns?: boolean | "auto";
};
export type FixReport = { presentationForms: boolean; bidiMarks: boolean; reversedLines: number; flippedRuns: number };

export function normalizeForms(text: string): string {
  return text.normalize("NFKC").replace(TATWEEL, "");
}

const reverse = (s: string) => Array.from(s).reverse().join("");

/** "ال" starts a large share of Arabic words; a visually stored line shows it as "لا" at word ends instead. */
function looksReversed(line: string): boolean {
  const words = line.split(/\s+/).filter((w) => ARABIC.test(w) && w.length > 2);
  if (words.length < 2) return false;
  const starts = words.filter((w) => w.startsWith("ال")).length;
  const ends = words.filter((w) => w.endsWith("لا")).length;
  return ends >= 2 && ends > starts * 2;
}

/** d/m/yyyy or yyyy/m/d with sensible parts (Gregorian or Hijri years). */
function plausibleDate(w: string): boolean {
  const m = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/.exec(w);
  if (!m) return false;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const year = (y: number) => y >= 1300 && y <= 2100;
  return b >= 1 && b <= 12 && ((m[3].length === 4 && year(c) && a >= 1 && a <= 31) || (m[1].length === 4 && year(a) && c >= 1 && c <= 31));
}

/** Numbers inside Arabic lines read left-to-right; a flipped year like "6202" or "01/40/8441" gives itself away. */
function looksFlipped(line: string): boolean {
  if (!ARABIC.test(line)) return false;
  const runs = line.match(LTR_RUN) ?? [];
  let flipped = 0, total = 0;
  for (const r of runs) {
    if (!/[0-9\u0660-\u0669]/.test(r)) continue;
    total++;
    const w = r.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660));
    const rw = reverse(w);
    if (/^(19|20)\d\d$/.test(w)) continue;
    if (/^(19|20)\d\d$/.test(rw)) { flipped++; continue; }
    if (plausibleDate(w)) continue;
    if (plausibleDate(rw)) { flipped++; continue; }
    if (/^%\d/.test(w)) flipped++;
  }
  return total > 0 && flipped >= 1 && flipped * 2 >= total;
}

/** True when the digits in an Arabic line read backwards (LibreOffice's PDF import does this). */
export const detectFlippedRuns = looksFlipped;
/** Reverse every digit/Latin run in the text, whatever the context (used per DOCX run once the paragraph was judged). */
export function flipLtrRuns(text: string): string {
  return text.replace(LTR_RUN, reverse);
}

export function fixArabicLine(line: string, o: FixOptions = {}, report?: FixReport): string {
  let s = line;
  if (looksReversed(s)) {
    s = s.split(/(\s+)/).map((part) => (/\s/.test(part) ? part : reverse(part))).reverse().join("");
    if (report) report.reversedLines++;
  }
  const mode = o.reverseLtrRuns ?? "auto";
  if (mode === true || (mode === "auto" && looksFlipped(s))) {
    s = s.replace(LTR_RUN, (run) => { if (report) report.flippedRuns++; return reverse(run); });
  }
  return s;
}

export function fixArabicText(text: string, o: FixOptions = {}): { text: string; report: FixReport } {
  const report: FixReport = { presentationForms: PRESENTATION.test(text), bidiMarks: BIDI_MARKS.test(text), reversedLines: 0, flippedRuns: 0 };
  const cleaned = normalizeForms(text).replace(BIDI_MARKS, "");
  const lines = cleaned.split(/\r?\n/).map((l) => (ARABIC.test(l) ? fixArabicLine(l, o, report) : l));
  return { text: lines.join("\n"), report };
}
