import { failFrom, ProviderError, type Adapter, type OcrLine, type OcrPage, type OcrWord } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

function finish(width: number, height: number, lines: OcrLine[]): OcrPage {
  return { width, height, lines, text: lines.map((l) => l.text).join("\n") };
}
function boxOf(points: { x: number; y: number }[], W: number, H: number) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x: x / W, y: y / H, w: (Math.max(...xs) - x) / W, h: (Math.max(...ys) - y) / H };
}

/** Azure Document Intelligence prebuilt-read: async analyze, then poll the operation. Arabic print and handwriting. */
export const azureDocint: Adapter = {
  ocr: async (c, i) => {
    const base = c.endpoint.replace(/\/$/, "");
    const start = await fetch(`${base}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": c.apiKey, "content-type": "application/json" }, body: JSON.stringify({ base64Source: b64(i.image) }) });
    if (!start.ok) await failFrom(start, "azure-docint");
    const op = start.headers.get("operation-location");
    if (!op) throw new ProviderError("error", "azure-docint: no operation-location");
    for (let n = 0; n < 60; n++) {
      await sleep(1000);
      const res = await fetch(op, { headers: { "Ocp-Apim-Subscription-Key": c.apiKey } });
      if (!res.ok) await failFrom(res, "azure-docint");
      const j = (await res.json()) as { status: string; analyzeResult?: { pages?: { width: number; height: number; words?: { content: string; polygon: number[] }[]; lines?: { content: string; polygon: number[] }[] }[] } };
      if (j.status === "running" || j.status === "notStarted") continue;
      if (j.status !== "succeeded") throw new ProviderError("error", `azure-docint: ${j.status}`);
      const p = j.analyzeResult?.pages?.[0];
      if (!p) return finish(i.width, i.height, []);
      const W = p.width || i.width, H = p.height || i.height;
      const toPts = (poly: number[]) => Array.from({ length: poly.length / 2 }, (_, k) => ({ x: poly[2 * k], y: poly[2 * k + 1] }));
      const words: OcrWord[] = (p.words ?? []).map((w) => ({ text: w.content, ...boxOf(toPts(w.polygon), W, H) }));
      const lines: OcrLine[] = (p.lines ?? []).map((l) => {
        const box = boxOf(toPts(l.polygon), W, H);
        const inside = words.filter((w) => w.x >= box.x - 0.005 && w.x + w.w <= box.x + box.w + 0.005 && w.y >= box.y - 0.005 && w.y + w.h <= box.y + box.h + 0.005);
        return { text: l.content, words: inside, ...box };
      });
      return finish(i.width, i.height, lines);
    }
    throw new ProviderError("unavailable", "azure-docint: analysis timed out");
  },
  test: async (c) => {
    const res = await fetch(`${c.endpoint.replace(/\/$/, "")}/documentintelligence/documentModels?api-version=2024-11-30`, { headers: { "Ocp-Apim-Subscription-Key": c.apiKey } });
    if (!res.ok) await failFrom(res, "azure-docint");
    return "Endpoint and key accepted";
  },
};

/** Google Cloud Vision DOCUMENT_TEXT_DETECTION with an API key; also carries the Translation v2 test. */
export const google: Adapter = {
  ocr: async (c, i) => {
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(c.apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requests: [{ image: { content: b64(i.image) }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: i.languages } }] }) });
    if (!res.ok) await failFrom(res, "google");
    const j = (await res.json()) as { responses?: { error?: { message: string }; fullTextAnnotation?: { pages?: { width: number; height: number; blocks?: { paragraphs?: { words?: { symbols?: { text: string; property?: { detectedBreak?: { type: string } } }[]; boundingBox?: { vertices: { x?: number; y?: number }[] } }[] }[] }[] }[] } }[] };
    const r = j.responses?.[0];
    if (r?.error) throw new ProviderError("error", `google: ${r.error.message}`);
    const p = r?.fullTextAnnotation?.pages?.[0];
    if (!p) return finish(i.width, i.height, []);
    const W = p.width || i.width, H = p.height || i.height;
    const lines: OcrLine[] = [];
    for (const b of p.blocks ?? []) for (const para of b.paragraphs ?? []) {
      let cur: OcrWord[] = [];
      const flush = () => {
        if (!cur.length) return;
        const x = Math.min(...cur.map((w) => w.x)), y = Math.min(...cur.map((w) => w.y));
        const x2 = Math.max(...cur.map((w) => w.x + w.w)), y2 = Math.max(...cur.map((w) => w.y + w.h));
        lines.push({ text: cur.map((w) => w.text).join(" "), words: cur, x, y, w: x2 - x, h: y2 - y });
        cur = [];
      };
      for (const w of para.words ?? []) {
        const text = (w.symbols ?? []).map((s) => s.text).join("");
        const pts = (w.boundingBox?.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 }));
        if (pts.length) cur.push({ text, ...boxOf(pts, W, H) });
        const brk = w.symbols?.[w.symbols.length - 1]?.property?.detectedBreak?.type;
        if (brk === "LINE_BREAK" || brk === "EOL_SURE_SPACE") flush();
      }
      flush();
    }
    return finish(i.width, i.height, lines);
  },
  translate: async (c, i) => {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(c.apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: i.text, target: i.to, ...(i.from === "auto" ? {} : { source: i.from }), format: "text" }) });
    if (!res.ok) await failFrom(res, "google");
    const j = (await res.json()) as { data?: { translations?: { translatedText?: string }[] } };
    return j.data?.translations?.[0]?.translatedText ?? "";
  },
  test: async (c) => {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(c.apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: "hello", target: "ar", format: "text" }) });
    if (!res.ok) await failFrom(res, "google");
    return "Key accepted (Translation API)";
  },
};

/** OCR.space free API: base64 image, Arabic engine, overlay for word boxes. 1 MB per request. */
export const ocrspace: Adapter = {
  ocr: async (c, i) => {
    if (i.image.byteLength > 1024 * 1024) throw new ProviderError("bad-input", "ocrspace: image over 1 MB");
    const form = new URLSearchParams({ base64Image: `data:${i.mime};base64,${b64(i.image)}`, language: i.languages.includes("ar") ? "ara" : "eng", isOverlayRequired: "true", OCREngine: "1", scale: "true" });
    const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: c.apiKey, "content-type": "application/x-www-form-urlencoded" }, body: form });
    if (!res.ok) await failFrom(res, "ocrspace");
    const j = (await res.json()) as { OCRExitCode?: number; ErrorMessage?: string | string[]; ParsedResults?: { TextOverlay?: { Lines?: { LineText: string; Words: { WordText: string; Left: number; Top: number; Height: number; Width: number }[] }[] } }[] };
    if (j.OCRExitCode && j.OCRExitCode > 2) {
      const msg = Array.isArray(j.ErrorMessage) ? j.ErrorMessage.join("; ") : String(j.ErrorMessage ?? "");
      throw new ProviderError(/api key|invalid/i.test(msg) ? "rejected" : "error", `ocrspace: ${msg}`);
    }
    const W = i.width, H = i.height;
    const lines: OcrLine[] = (j.ParsedResults?.[0]?.TextOverlay?.Lines ?? []).map((l) => {
      const words: OcrWord[] = l.Words.map((w) => ({ text: w.WordText, x: w.Left / W, y: w.Top / H, w: w.Width / W, h: w.Height / H }));
      const x = Math.min(...words.map((w) => w.x)), y = Math.min(...words.map((w) => w.y));
      return { text: l.LineText, words, x, y, w: Math.max(...words.map((w) => w.x + w.w)) - x, h: Math.max(...words.map((w) => w.y + w.h)) - y };
    });
    return finish(W, H, lines);
  },
  test: async (c) => {
    // A 1×1 PNG: cheapest valid request.
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: c.apiKey, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ base64Image: `data:image/png;base64,${png}`, language: "eng" }) });
    if (!res.ok) await failFrom(res, "ocrspace");
    const j = (await res.json()) as { OCRExitCode?: number; ErrorMessage?: string | string[] };
    const msg = Array.isArray(j.ErrorMessage) ? j.ErrorMessage.join("; ") : String(j.ErrorMessage ?? "");
    if (/api key/i.test(msg)) throw new ProviderError("rejected", `ocrspace: ${msg}`);
    return "Key accepted";
  },
};

/** Azure Translator v3. */
export const azureTranslator: Adapter = {
  translate: async (c, i) => {
    const q = new URLSearchParams({ "api-version": "3.0", to: i.to, ...(i.from === "auto" ? {} : { from: i.from }) });
    const res = await fetch(`https://api.cognitive.microsofttranslator.com/translate?${q}`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": c.apiKey, "Ocp-Apim-Subscription-Region": c.region, "content-type": "application/json" }, body: JSON.stringify([{ Text: i.text }]) });
    if (!res.ok) await failFrom(res, "azure-translator");
    const j = (await res.json()) as { translations?: { text: string }[] }[];
    return j[0]?.translations?.[0]?.text ?? "";
  },
  test: async (c) => {
    const res = await fetch("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=ar", { method: "POST", headers: { "Ocp-Apim-Subscription-Key": c.apiKey, "Ocp-Apim-Subscription-Region": c.region, "content-type": "application/json" }, body: JSON.stringify([{ Text: "hello" }]) });
    if (!res.ok) await failFrom(res, "azure-translator");
    return "Key and region accepted";
  },
};

/** Deterministic stand-in for tests: never leaves the machine. */
export const mock: Adapter = {
  ocr: async (_c, i) => finish(i.width, i.height, [{ text: "نص تجريبي MOCK", x: 0.1, y: 0.1, w: 0.5, h: 0.05, words: [{ text: "نص", x: 0.5, y: 0.1, w: 0.1, h: 0.05 }, { text: "تجريبي", x: 0.3, y: 0.1, w: 0.18, h: 0.05 }, { text: "MOCK", x: 0.1, y: 0.1, w: 0.15, h: 0.05 }] }]),
  translate: async (_c, i) => (i.to === "ar" ? `[ترجمة] ${i.text}` : `[translation] ${i.text}`),
  summarize: async (_c, i) => (i.lang === "ar" ? `• ملخص تجريبي (${i.text.split(/\s+/).length} كلمة)` : `• Mock summary (${i.text.split(/\s+/).length} words)`),
  test: async (c) => {
    if (c.apiKey === "reject") throw new ProviderError("rejected", "mock: key rejected");
    return "Mock provider ready";
  },
};
