import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expiredHourPrefixes, hourPrefix, inputKey, jobPrefix, outputKey, safeName, LocalStorage, localVerify, contentDisposition } from "./index.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const at = new Date("2026-09-13T11:42:00Z");
eq(hourPrefix(at), "jobs/2026-09-13T11", "hour prefix");
eq(safeName("عقد نهائي.PDF", 0), "0.pdf", "safe name keeps extension only");
eq(safeName("noext", 2), "2.bin", "safe name fallback");
eq(inputKey("jobs/2026-09-13T11", "abc", 1, "a.docx"), "jobs/2026-09-13T11/abc/in/1.docx", "input key");
eq(outputKey("jobs/2026-09-13T11", "abc", "result.pdf"), "jobs/2026-09-13T11/abc/out/result.pdf", "output key");
eq(jobPrefix("jobs/2026-09-13T11/abc/out/result.pdf"), "jobs/2026-09-13T11/abc", "job prefix");
// At 11:42 with a 1 h TTL, the 09:00 bucket (ended 10:00) is expired, the 10:00 one (ended 11:00) is not yet.
eq(expiredHourPrefixes(3600, at, 3), ["jobs/2026-09-13T09", "jobs/2026-09-13T08"], "expired buckets");
assert(contentDisposition("عقد.pdf").includes("filename*=UTF-8''%D8%B9%D9%82%D8%AF.pdf"), "rfc 5987 name");

// Local storage round trip with signed URLs.
const root = mkdtempSync(join(tmpdir(), "alarab-jobs-"));
const s = new LocalStorage(root, "http://localhost:3000");
const src = join(root, "src.txt");
writeFileSync(src, "hello");
const key = "jobs/2026-09-13T11/abc/in/0.txt";
await s.upload(src, key, "text/plain");
eq(await s.head(key), { size: 5 }, "head after upload");
await s.download(key, join(root, "copy.txt"));
eq(readFileSync(join(root, "copy.txt"), "utf8"), "hello", "download");
eq(await s.list("jobs/2026-09-13T11"), [key], "list");
const put = new URL(await s.putUrl(key, 5, "text/plain"));
assert(localVerify(put.searchParams.get("sig")!, key, "PUT", Number(put.searchParams.get("exp")), 5, "text/plain"), "put url verifies");
assert(!localVerify(put.searchParams.get("sig")!, key, "PUT", Number(put.searchParams.get("exp")), 6, "text/plain"), "size is pinned");
const get = new URL(await s.getUrl(key, "ملف.txt"));
assert(localVerify(get.searchParams.get("sig")!, key, "GET", Number(get.searchParams.get("exp"))), "get url verifies");
eq(await s.deletePrefix("jobs/2026-09-13T11/abc"), 1, "delete prefix");
eq(await s.head(key), null, "gone");
let threw = false;
try { s.path("../etc/passwd"); } catch { threw = true; }
assert(threw, "path traversal rejected");

console.log("jobs ok");
