import { failFrom, ProviderError, summarizePrompt, translatePrompt, type Adapter, type Creds } from "./types";
import { fetchModelIds, pickModel, withModel, type ModelSource } from "./models";

type ChatExtra = Record<string, unknown>;

/** Reasoning models put their thinking in a separate field or in <think> tags; only the answer is kept. */
function answerOf(content: string | undefined): string {
  return (content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** OpenAI-style chat completion shared by Groq and Mistral. */
async function chat(url: string, headers: Record<string, string>, model: string, system: string, user: string, provider: string, maxTokens: number, extra: ChatExtra = {}): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, max_tokens: maxTokens, ...extra }),
  });
  if (!res.ok) await failFrom(res, provider);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = answerOf(j.choices?.[0]?.message?.content);
  if (!out) throw new ProviderError("error", `${provider}: empty completion (${model})`);
  return out;
}

// ---------- Groq ----------
const NOT_CHAT = /whisper|guard|orpheus|tts|playai|distil|embed|compound/i;
const groqModels = (c: Creds): ModelSource => ({
  provider: "groq",
  secret: c.apiKey,
  override: process.env.GROQ_MODEL || undefined,
  // Large multilingual models first; allam-2-7b is Arabic-native but has a 4K context window.
  prefer: ["openai/gpt-oss-120b", "qwen/qwen3.8-*", "qwen/qwen3.6-*", "qwen/qwen3*", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"],
  accept: (id) => !NOT_CHAT.test(id) && !/allam/i.test(id),
  list: () => fetchModelIds("https://api.groq.com/openai/v1/models", { authorization: `Bearer ${c.apiKey}` }, "groq", (j) => ((j as { data?: { id: string; active?: boolean }[] }).data ?? []).filter((m) => m.active !== false).map((m) => m.id)),
});
/** Per-family request options: keep reasoning short and out of the answer. */
function groqExtra(model: string): ChatExtra {
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low", include_reasoning: false };
  if (model.startsWith("qwen/")) return { reasoning_format: "hidden" };
  return {};
}
const groqChat = (c: Creds, system: string, user: string, maxTokens: number) =>
  withModel(groqModels(c), (model) => chat("https://api.groq.com/openai/v1/chat/completions", { authorization: `Bearer ${c.apiKey}` }, model, system, user, "groq", maxTokens, groqExtra(model)));

export const groq: Adapter = {
  summarize: (c, i) => groqChat(c, summarizePrompt(i.lang, i.maxWords), i.text, 3000),
  translate: (c, i) => groqChat(c, translatePrompt(i.from, i.to), i.text, 8000),
  test: async (c) => `Key accepted · model ${await pickModel(groqModels(c), true)}`,
};

// ---------- Mistral ----------
const mistralModels = (c: Creds): ModelSource => ({
  provider: "mistral",
  secret: c.apiKey,
  override: process.env.MISTRAL_MODEL || undefined,
  prefer: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest", "open-mistral-nemo"],
  accept: (id) => /mistral|ministral/i.test(id) && !/embed|ocr|moderation|codestral|voxtral|pixtral/i.test(id),
  list: () => fetchModelIds("https://api.mistral.ai/v1/models", { authorization: `Bearer ${c.apiKey}` }, "mistral", (j) => ((j as { data?: { id: string }[] }).data ?? []).map((m) => m.id)),
});
const mistralChat = (c: Creds, system: string, user: string, maxTokens: number) =>
  withModel(mistralModels(c), (model) => chat("https://api.mistral.ai/v1/chat/completions", { authorization: `Bearer ${c.apiKey}` }, model, system, user, "mistral", maxTokens));

export const mistral: Adapter = {
  summarize: (c, i) => mistralChat(c, summarizePrompt(i.lang, i.maxWords), i.text, 2000),
  translate: (c, i) => mistralChat(c, translatePrompt(i.from, i.to), i.text, 6000),
  test: async (c) => `Key accepted · model ${await pickModel(mistralModels(c), true)}`,
};

// ---------- Cloudflare Workers AI ----------
const cfBase = (c: Creds) => `https://api.cloudflare.com/client/v4/accounts/${c.accountId}/ai`;
const cfModels = (c: Creds, task: "Text Generation" | "Translation"): ModelSource => ({
  provider: `cloudflare-${task}`,
  secret: `${c.accountId}:${c.apiToken}`,
  override: (task === "Translation" ? process.env.CLOUDFLARE_TRANSLATE_MODEL : process.env.CLOUDFLARE_TEXT_MODEL) || undefined,
  prefer: task === "Translation" ? ["@cf/meta/m2m100-1.2b"] : ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/openai/gpt-oss-120b", "@cf/qwen/*", "@cf/meta/llama-3.1-8b-instruct"],
  accept: (id) => (task === "Translation" ? /m2m|translat/i.test(id) : /instruct|gpt-oss|chat/i.test(id) && !/guard|vision|coder/i.test(id)),
  list: () => fetchModelIds(`${cfBase(c)}/models/search?task=${encodeURIComponent(task)}&per_page=100`, { authorization: `Bearer ${c.apiToken}` }, "cloudflare", (j) => ((j as { result?: { name: string }[] }).result ?? []).map((m) => m.name)),
});

async function cfRun(c: Creds, model: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${cfBase(c)}/run/${model}`, { method: "POST", headers: { authorization: `Bearer ${c.apiToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) await failFrom(res, "cloudflare");
  return ((await res.json()) as { result?: Record<string, unknown> }).result ?? {};
}

export const cloudflare: Adapter = {
  summarize: (c, i) =>
    withModel(cfModels(c, "Text Generation"), async (model) => {
      const r = await cfRun(c, model, { messages: [{ role: "system", content: summarizePrompt(i.lang, i.maxWords) }, { role: "user", content: i.text }], max_tokens: 1500 });
      const out = answerOf(typeof r.response === "string" ? r.response : (r as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content);
      if (!out) throw new ProviderError("error", `cloudflare: empty completion (${model})`);
      return out;
    }),
  translate: (c, i) =>
    withModel(cfModels(c, "Translation"), async (model) => {
      const source = i.from === "auto" ? (/[؀-ۿ]/.test(i.text) ? "arabic" : "english") : i.from === "ar" ? "arabic" : "english";
      const r = await cfRun(c, model, { text: i.text, source_lang: source, target_lang: i.to === "ar" ? "arabic" : "english" });
      const out = typeof r.translated_text === "string" ? r.translated_text.trim() : "";
      if (!out) throw new ProviderError("error", `cloudflare: empty translation (${model})`);
      return out;
    }),
  test: async (c) => `Workers AI reachable · ${await pickModel(cfModels(c, "Text Generation"), true)} and ${await pickModel(cfModels(c, "Translation"), true)}`,
};

// ---------- Gemini ----------
const geminiModels = (c: Creds): ModelSource => ({
  provider: "gemini",
  secret: c.apiKey,
  override: process.env.GEMINI_MODEL || undefined,
  prefer: ["gemini-flash-latest", "gemini-3-flash*", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"],
  accept: (id) => /^gemini-.*flash/i.test(id) && !/image|tts|audio|live|embedding|thinking-exp/i.test(id),
  list: async () => {
    const ids: string[] = [];
    let token = "";
    for (let page = 0; page < 5; page++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200${token ? `&pageToken=${token}` : ""}&key=${encodeURIComponent(c.apiKey)}`);
      if (!res.ok) await failFrom(res, "gemini");
      const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
      for (const m of j.models ?? []) if (m.supportedGenerationMethods?.includes("generateContent")) ids.push(m.name.replace(/^models\//, ""));
      if (!j.nextPageToken) break;
      token = j.nextPageToken;
    }
    return ids;
  },
});

async function geminiGenerate(c: Creds, system: string, user: string): Promise<string> {
  return withModel(geminiModels(c), async (model) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(c.apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.2 } }),
    });
    if (!res.ok) await failFrom(res, "gemini");
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const out = answerOf(j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join(""));
    if (!out) throw new ProviderError("error", `gemini: empty completion (${model})`);
    return out;
  });
}

export const gemini: Adapter = {
  summarize: (c, i) => geminiGenerate(c, summarizePrompt(i.lang, i.maxWords), i.text),
  translate: (c, i) => geminiGenerate(c, translatePrompt(i.from, i.to), i.text),
  test: async (c) => `Key accepted · model ${await pickModel(geminiModels(c), true)}`,
};
