import { chat, failFrom, summarizePrompt, translatePrompt, type Adapter } from "./types";

export const groq: Adapter = {
  summarize: (c, i) => chat("https://api.groq.com/openai/v1/chat/completions", { authorization: `Bearer ${c.apiKey}` }, "llama-3.3-70b-versatile", summarizePrompt(i.lang, i.maxWords), i.text, "groq"),
  translate: (c, i) => chat("https://api.groq.com/openai/v1/chat/completions", { authorization: `Bearer ${c.apiKey}` }, "llama-3.3-70b-versatile", translatePrompt(i.from, i.to), i.text, "groq", 4000),
  test: async (c) => {
    const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${c.apiKey}` } });
    if (!res.ok) await failFrom(res, "groq");
    return "Key accepted";
  },
};

export const mistral: Adapter = {
  summarize: (c, i) => chat("https://api.mistral.ai/v1/chat/completions", { authorization: `Bearer ${c.apiKey}` }, "mistral-small-latest", summarizePrompt(i.lang, i.maxWords), i.text, "mistral"),
  translate: (c, i) => chat("https://api.mistral.ai/v1/chat/completions", { authorization: `Bearer ${c.apiKey}` }, "mistral-small-latest", translatePrompt(i.from, i.to), i.text, "mistral", 4000),
  test: async (c) => {
    const res = await fetch("https://api.mistral.ai/v1/models", { headers: { authorization: `Bearer ${c.apiKey}` } });
    if (!res.ok) await failFrom(res, "mistral");
    return "Key accepted";
  },
};

const cfUrl = (c: Record<string, string>, model: string) => `https://api.cloudflare.com/client/v4/accounts/${c.accountId}/ai/run/${model}`;
export const cloudflare: Adapter = {
  summarize: (c, i) => chat(cfUrl(c, "@cf/meta/llama-3.1-8b-instruct"), { authorization: `Bearer ${c.apiToken}` }, "@cf/meta/llama-3.1-8b-instruct", summarizePrompt(i.lang, i.maxWords), i.text, "cloudflare").catch(async (e) => {
    // Workers AI wraps the OpenAI shape as {result:{response}} on some models.
    if (!(e instanceof Error) || !/empty completion/.test(e.message)) throw e;
    const res = await fetch(cfUrl(c, "@cf/meta/llama-3.1-8b-instruct"), { method: "POST", headers: { authorization: `Bearer ${c.apiToken}`, "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "system", content: summarizePrompt(i.lang, i.maxWords) }, { role: "user", content: i.text }] }) });
    if (!res.ok) await failFrom(res, "cloudflare");
    const j = (await res.json()) as { result?: { response?: string } };
    return j.result?.response?.trim() ?? "";
  }),
  translate: async (c, i) => {
    const res = await fetch(cfUrl(c, "@cf/meta/m2m100-1.2b"), { method: "POST", headers: { authorization: `Bearer ${c.apiToken}`, "content-type": "application/json" }, body: JSON.stringify({ text: i.text, source_lang: i.from === "auto" ? (/[؀-ۿ]/.test(i.text) ? "arabic" : "english") : i.from === "ar" ? "arabic" : "english", target_lang: i.to === "ar" ? "arabic" : "english" }) });
    if (!res.ok) await failFrom(res, "cloudflare");
    const j = (await res.json()) as { result?: { translated_text?: string } };
    return j.result?.translated_text?.trim() ?? "";
  },
  test: async (c) => {
    const res = await fetch(cfUrl(c, "@cf/meta/m2m100-1.2b"), { method: "POST", headers: { authorization: `Bearer ${c.apiToken}`, "content-type": "application/json" }, body: JSON.stringify({ text: "hello", source_lang: "english", target_lang: "arabic" }) });
    if (!res.ok) await failFrom(res, "cloudflare");
    return "Workers AI reachable";
  },
};

const geminiUrl = (key: string) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
async function gemini1(key: string, system: string, user: string): Promise<string> {
  const res = await fetch(geminiUrl(key), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.2 } }) });
  if (!res.ok) await failFrom(res, "gemini");
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
}
export const gemini: Adapter = {
  summarize: (c, i) => gemini1(c.apiKey, summarizePrompt(i.lang, i.maxWords), i.text),
  translate: (c, i) => gemini1(c.apiKey, translatePrompt(i.from, i.to), i.text),
  test: async (c) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(c.apiKey)}&pageSize=1`);
    if (!res.ok) await failFrom(res, "gemini");
    return "Key accepted";
  },
};
