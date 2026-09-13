/** Split long text into chunks that fit a provider request, preferring paragraph then sentence boundaries. */
export function chunkText(text: string, maxChars = 6000): string[] {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const out: string[] = [];
  let cur = "";
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (const para of clean.split(/\n{2,}/)) {
    if (para.length > maxChars) {
      // A single huge paragraph: cut at sentence ends.
      for (const sentence of para.split(/(?<=[.!?؟。])\s+/)) {
        if (cur.length + sentence.length + 1 > maxChars) push();
        if (sentence.length > maxChars) { for (let i = 0; i < sentence.length; i += maxChars) { cur = sentence.slice(i, i + maxChars); push(); } continue; }
        cur += (cur ? " " : "") + sentence;
      }
      continue;
    }
    if (cur.length + para.length + 2 > maxChars) push();
    cur += (cur ? "\n\n" : "") + para;
  }
  push();
  return out;
}
