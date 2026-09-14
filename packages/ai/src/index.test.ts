/**
 * Uses its own Redis database (15 by default, AI_TEST_REDIS_URL to change it) and never REDIS_URL:
 * the test deletes every alarab:ai:* key, which on the app's database would wipe saved provider keys.
 * Uses the mock provider only; nothing leaves the machine.
 */
const TEST_REDIS = process.env.AI_TEST_REDIS_URL ?? "redis://localhost:6379/15";
if (!/\/(1[0-5]|[2-9])$/.test(TEST_REDIS)) throw new Error(`Refusing to run: AI_TEST_REDIS_URL must name a spare database (e.g. redis://localhost:6379/15), got ${TEST_REDIS}`);
process.env.REDIS_URL = TEST_REDIS;
process.env.KEYS_SECRET = "test-secret";
process.env.AI_MOCK = "1";

import { redis } from "@alarab/jobs";
import { candidates, choose, decrypt, encrypt, getConfig, isModelGone, publicConfig, recordUsage, regionOf, setProviderEnabled, setProviderFields, setRouting, summarize, testProvider, translate, NoProviderError } from "./index.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const r = redis();
// Isolate from any real config on this Redis.
const keys = await r.keys("alarab:ai:*");
if (keys.length) await r.del(...keys);

eq(encrypt("x") === encrypt("x"), false, "random iv");
eq(decrypt(encrypt("gsk_secret_value")), "gsk_secret_value", "roundtrip");
eq(regionOf("DE"), "eu", "germany is europe");
eq(regionOf("GB"), "eu", "uk counts as europe");
eq(regionOf("SA"), "other", "saudi is other");
eq(regionOf(undefined), "eu", "unknown counts as europe");

// Nothing configured: every candidate is skipped.
let c = await candidates("translate", { region: "other", source: "web" });
assert(c.every((x) => x.skipped), "all skipped when unconfigured");

await setProviderFields("mock", { apiKey: "mock-key-1234" });
await setProviderFields("gemini", { apiKey: "AIza-fake-key-9c1d" });
await setProviderEnabled("mock", true);
await setProviderEnabled("gemini", true);
const pub = publicConfig(await getConfig());
eq(pub.providers.gemini.fields.apiKey.last4, "9c1d", "last four only");
assert(!JSON.stringify(pub).includes("AIza-fake"), "secret never in public config");

await setRouting({ translate: ["gemini", "mock"], summarize: ["mock", "gemini"], ocr: ["mock"] });
const tr = (await getConfig()).routing.translate;
eq(tr[0], "mock", "saved order first");
eq(tr[tr.length - 1], "gemini", "gemini pinned last");
assert(tr.includes("groq") && tr.indexOf("groq") > tr.indexOf("mock"), "providers missing from a saved order are still tried, after the saved ones");

const usable = (list: { id: string; skipped?: string }[]) => list.filter((x) => !x.skipped).map((x) => x.id);
c = await candidates("translate", { region: "eu", source: "web" });
eq(usable(c), ["mock"], "only mock usable in europe");
eq(c.find((x) => x.id === "gemini")?.skipped, "visitor in Europe", "gemini skipped in europe");
c = await candidates("translate", { region: "other", source: "web" });
eq(usable(c), ["mock", "gemini"], "gemini allowed outside europe");
c = await candidates("translate", { region: "other", source: "api" });
eq(usable(c), [], "nothing usable for api jobs");
assert(c.filter((x) => x.id === "mock" || x.id === "gemini").every((x) => x.skipped?.includes("API")), "enabled free tiers are refused for api jobs");

const t = await translate({ text: "hello", from: "en", to: "ar" }, { region: "eu", source: "web" });
eq(t, { result: "[ترجمة] hello", provider: "mock" }, "translate via mock");
const s = await summarize({ text: "one two three", lang: "en" }, { region: "eu", source: "web" });
eq(s.provider, "mock", "summarize via mock");

// Safety margin: mock's limit is 100000/day; push usage past 90%.
await recordUsage("mock", 95000);
c = await candidates("summarize", { region: "eu", source: "web" });
eq(c[0].skipped, "at 95% of the free limit", "margin skip");
let threw = false;
try { await summarize({ text: "x", lang: "ar" }, { region: "eu", source: "web" }); } catch (e) { threw = e instanceof NoProviderError; }
assert(threw, "no provider error when all skipped");

// Test button: rejected key is reported.
await setProviderFields("mock", { apiKey: "reject" });
const res = await testProvider("mock");
eq(res.ok, false, "rejected key reported");
assert(res.message.includes("rejected"), "rejection message");

const left = await r.keys("alarab:ai:*");
if (left.length) await r.del(...left);
await r.quit();
// Model choice against the list Groq returned on 14 Sep 2026 (no Llama chat models left).
const groqList = ["allam-2-7b", "canopylabs/orpheus-arabic-saudi", "groq/compound", "meta-llama/llama-prompt-guard-2-86m", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b", "qwen/qwen3.8-27b", "whisper-large-v3"];
const groqPrefer = ["openai/gpt-oss-120b", "qwen/qwen3.8-*", "qwen/qwen3.6-*", "qwen/qwen3*", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"];
const groqAccept = (id: string) => !/whisper|guard|orpheus|tts|playai|distil|embed|compound/i.test(id) && !/allam/i.test(id);
eq(choose(groqList, groqPrefer, groqAccept), "openai/gpt-oss-120b", "groq picks gpt-oss-120b");
eq(choose(groqList.filter((m) => !m.includes("gpt-oss-120b")), groqPrefer, groqAccept), "qwen/qwen3.8-27b", "then the newest qwen");
eq(choose(["whisper-large-v3", "some-new-chat-model"], groqPrefer, groqAccept), "some-new-chat-model", "falls back to any chat model");
eq(choose(["whisper-large-v3"], groqPrefer, groqAccept), null, "no chat model");
assert(isModelGone(new Error('groq: 404 {"error":{"message":"The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.","code":"model_not_found"}}')), "detects retired model");
assert(!isModelGone(new Error("groq: rate limited")), "rate limit is not a missing model");

console.log("ai ok");
