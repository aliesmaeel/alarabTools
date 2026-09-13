/** Page selection helpers. Page numbers are 1-based everywhere users see them. */

/**
 * Parse a range string like "1-3, 5, 8-" into 0-based page indices.
 * Accepts Arabic-Indic digits and Arabic commas. Ignores out-of-range pages.
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const normalized = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[،؛]/g, ",")
    .replace(/[–—‐]/g, "-");
  const out = new Set<number>();
  for (const part of normalized.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(p);
    if (m) {
      const from = m[1] ? Number(m[1]) : 1;
      const to = m[2] ? Number(m[2]) : pageCount;
      for (let i = Math.max(1, from); i <= Math.min(pageCount, to); i++) out.add(i - 1);
    } else if (/^\d+$/.test(p)) {
      const n = Number(p);
      if (n >= 1 && n <= pageCount) out.add(n - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Split page indices into consecutive chunks of `size`. */
export function chunk(pageCount: number, size: number): number[][] {
  const chunks: number[][] = [];
  for (let start = 0; start < pageCount; start += size) {
    chunks.push(Array.from({ length: Math.min(size, pageCount - start) }, (_, i) => start + i));
  }
  return chunks;
}
