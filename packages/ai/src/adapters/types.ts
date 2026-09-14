export type Creds = Record<string, string>;

/** One recognised word with its box as fractions of the page (top-left origin). */
export type OcrWord = { text: string; x: number; y: number; w: number; h: number };
export type OcrLine = { text: string; words: OcrWord[]; x: number; y: number; w: number; h: number };
export type OcrPage = { width: number; height: number; lines: OcrLine[]; text: string };

export type OcrInput = { image: Uint8Array; mime: "image/png" | "image/jpeg"; width: number; height: number; languages: string[] };
export type TranslateInput = { text: string; from: "ar" | "en" | "auto"; to: "ar" | "en" };
export type SummarizeInput = { text: string; lang: "ar" | "en"; maxWords?: number };

export class ProviderError extends Error {
  constructor(public kind: "rejected" | "quota" | "unavailable" | "bad-input" | "error", message: string, public retryAfterSeconds?: number) {
    super(message);
  }
}

export type Adapter = {
  ocr?: (creds: Creds, input: OcrInput) => Promise<OcrPage>;
  translate?: (creds: Creds, input: TranslateInput) => Promise<string>;
  summarize?: (creds: Creds, input: SummarizeInput) => Promise<string>;
  /** Cheapest request that proves the key works. */
  test: (creds: Creds) => Promise<string>;
};

/** Map HTTP failures to a kind the gateway can act on. */
export async function failFrom(res: Response, provider: string): Promise<never> {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  const retry = Number(res.headers.get("retry-after")) || undefined;
  if (res.status === 401 || res.status === 403) throw new ProviderError("rejected", `${provider}: key rejected (${res.status}) ${text}`);
  if (res.status === 429) throw new ProviderError("quota", `${provider}: rate limited ${text}`, retry);
  if (res.status >= 500) throw new ProviderError("unavailable", `${provider}: ${res.status} ${text}`, retry);
  if (res.status === 400 || res.status === 413 || res.status === 422) throw new ProviderError("bad-input", `${provider}: ${res.status} ${text}`);
  throw new ProviderError("error", `${provider}: ${res.status} ${text}`);
}

export const summarizePrompt = (lang: "ar" | "en", maxWords = 250) =>
  lang === "ar"
    ? `لخّص النص التالي بالعربية الفصحى في نقاط واضحة، بما لا يزيد عن ${maxWords} كلمة. اذكر الأفكار الرئيسية والأرقام والتواريخ المهمة. لا تضف مقدمة أو خاتمة.`
    : `Summarize the following text in clear bullet points, at most ${maxWords} words. Keep the key ideas, figures and dates. No preamble.`;

export const translatePrompt = (from: string, to: "ar" | "en") =>
  `Translate the following text ${from === "auto" ? "" : `from ${from === "ar" ? "Arabic" : "English"} `}into ${to === "ar" ? "Modern Standard Arabic" : "English"}. Preserve line breaks, numbers and names. Output only the translation.`;

