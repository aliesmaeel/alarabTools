// Smoke test: every URL in the sitemap must return 200 with the right <html lang/dir>.
// Usage: BASE_URL=http://localhost:3000 node scripts/smoke.mjs
const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
if (locs.length < 90) throw new Error(`sitemap lists only ${locs.length} URLs`);

let failed = 0;
await Promise.all(
  locs.map(async (path) => {
    const res = await fetch(base + path);
    const html = await res.text();
    const isEn = path === "/en" || path.startsWith("/en/");
    const wantLang = isEn ? "en" : "ar";
    const wantDir = isEn ? "ltr" : "rtl";
    const ok =
      res.status === 200 &&
      html.includes(`<html lang="${wantLang}" dir="${wantDir}"`) &&
      html.includes('hrefLang="x-default"') &&
      /<h1[^>]*>[^<]+<\/h1>/.test(html);
    if (!ok) {
      failed++;
      console.error(`FAIL ${res.status} ${path}`);
    }
  }),
);

if (failed) {
  console.error(`${failed} of ${locs.length} pages failed`);
  process.exit(1);
}
console.log(`smoke ok: ${locs.length} pages`);
