/** Needs a Redis at REDIS_URL (CI starts one). Uses the mock provider only; nothing leaves the machine. */
process.env.KEYS_SECRET ??= "test-secret";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.AI_MOCK = "1";

import { redis } from "@alarab/jobs";
import { candidates, decrypt, encrypt, getConfig, publicConfig, recordUsage, regionOf, setProviderEnabled, setProviderFields, setRouting, summarize, testProvider, translate, NoProviderError } from "./index.ts";

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
eq((await getConfig()).routing.translate, ["mock", "gemini"], "gemini pinned last");

c = await candidates("translate", { region: "eu", source: "web" });
eq(c, [{ id: "mock" }, { id: "gemini", skipped: "visitor in Europe" }], "gemini skipped in europe");
c = await candidates("translate", { region: "other", source: "web" });
eq(c, [{ id: "mock" }, { id: "gemini" }], "gemini allowed outside europe");
c = await candidates("translate", { region: "other", source: "api" });
assert(c.every((x) => x.skipped?.includes("API")), "no free tiers for api jobs");

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
console.log("ai ok");
