# alarabTools

Arabic-first (RTL) + English PDF and image tools, in the style of iLovePDF and iLoveIMG. 48 tools: 31 run in the browser, 17 on a worker.

Plans and decisions live in [docs/](docs/): the architecture document, the accounts to create, and the design mockups in [design/](design/).

## Layout

```
apps/web          Next.js 16 site (App Router, next-intl, Tailwind 4). Deploys to Vercel.
apps/worker       Job runner for server tools: Redis queue, S3/R2 files, LibreOffice, Ghostscript, qpdf, Chromium.
packages/tools    The tool registry: every page, badge, sitemap entry and API route reads from it.
packages/pdf-core pdf-lib operations shared by the browser worker and (later) the API worker.
packages/arabic   Bidi + shaping-aware text drawing, digits, Hijri dates, bundled OFL fonts, the Arabic text fixer.
packages/image-core Decode/resize/encode on ImageData; jSquash codecs (mozjpeg, libwebp, oxipng) loaded at runtime.
packages/jobs     Job records and queue (Redis), storage adapters (R2 via S3 API, or a local folder), key layout.
packages/ai       AI gateway: provider catalog, encrypted keys in Redis, usage meters, routing rules, fetch adapters.
packages/*        ui (later).
```

## Run it

```bash
pnpm install
pnpm --filter web dev          # http://localhost:3000 (Arabic), /en (English)
pnpm --filter @alarab/tools test
pnpm --filter @alarab/arabic test
pnpm --filter @alarab/pdf-core test
pnpm --filter web build && pnpm --filter web start
node apps/web/scripts/smoke.mjs   # checks every page in the sitemap against a running server
BASE_URL=http://localhost:3000 pnpm --filter web test:e2e   # Playwright, uses the installed Chrome
```

Copy `apps/web/.env.example` to `apps/web/.env.local`. Set `NEXT_PUBLIC_SITE_URL` to the real domain in Vercel so canonical URLs, hreflang and the sitemap are correct.

## Conventions

- URLs: Arabic is the default locale with no prefix (`/merge-pdf`); English is `/en/merge-pdf`. Slugs are Latin in both languages.
- Add a tool by adding one entry to `packages/tools/src/registry.ts`. Its pages, cards, sitemap entries and privacy badge appear automatically. The registry test enforces the counts.
- Use Tailwind logical utilities only (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`) so layouts mirror correctly in RTL.
- The privacy badge ("On your device" / "On our servers") comes from the tool's `runtime` field; never hard-code it.
- UI strings live in `apps/web/messages/{ar,en}.json`. Tool names and summaries live in the registry.
- Digits: Arabic-Indic (١٢٣) by default on the Arabic site, Western (123) on English; tools that print numbers offer both (`defaultDigits` in `@alarab/arabic`).
- Tools with `input: "text"` in the registry (Arabic fonts) skip the drop zone; their module sets `noFiles: true`.
- Any text drawn into a PDF goes through `drawText` in `@alarab/arabic`, which splits bidi runs so Arabic joins and reads right-to-left. Never call `page.drawText` with Arabic directly.
- Fonts are in `packages/arabic/fonts` (source of truth) and copied to `apps/web/public/fonts`.

## Status

48 tools, all implemented. Server and AI tools need Redis, storage and the worker (see Deploying); AI tools also need provider keys in the admin dashboard.

- P0 Foundation: done (registry, bilingual site, tool page template with SEO metadata and JSON-LD, sitemap, smoke test, CI).
- P1 Browser PDF tools: done (19): merge, split, remove pages, extract pages, organize, scan to PDF, rotate, crop, protect, unlock, sign, compare, JPG to PDF, PDF to JPG, page numbers, watermark (text or logo), Hijri date stamp, Arabic fonts (text to PDF/PNG), edit PDF (text, images, drawing, shapes, highlight, whiteout).
- P2 Browser image tools: done (10): compress, resize, convert to JPG, convert from JPG (PNG/WebP), rotate/flip, crop, watermark (text or logo), meme generator, blur faces, photo editor (presets, adjustments, Arabic text, stickers, frames). HEIC/HEIF input works in every image tool (libheif).
- Markdown editor (browser): open or drop a .md file, formatting toolbar, live preview with per-line Arabic direction, draft kept in the browser; export PDF (print dialog), Word (DOCX written in the browser), HTML and .md.
- P3 Server pipeline: done (9 tools): compress PDF, repair PDF, PDF to PDF/A, Word/Excel/PowerPoint to PDF, HTML to PDF, HTML to image, redact PDF (true redaction: marked pages are rasterised). Files are deleted after one hour by the worker's sweeper; uploads and downloads go straight to storage with signed URLs (10 minutes).
- P4 AI gateway and admin dashboard: done. Gateway (Groq, Cloudflare Workers AI, Azure Document Intelligence and Translator, Google Vision and Translation, OCR.space, Gemini, Mistral; mock provider for tests) and /admin (password sign-in, provider cards with key entry, test button and usage meters, routing order and safety margin, audit log). Tools: OCR PDF (searchable PDF with an invisible text layer plus .txt), PDF to Word (LibreOffice import for text PDFs, OCR for scans, Arabic fixer on the result), PDF to Excel, PDF to PowerPoint, fix Arabic text. Remaining: self-hosted OCR fallback.
- P5 AI tools: done. Summarize PDF (chunked, then a summary of summaries), translate PDF (page by page), remove background (self-hosted rembg), upscale image 2x/4x in the browser (ESRGAN-slim on TensorFlow.js).
- P6 Developer API and billing: not started. Payments: Stripe.
- P7 Launch: not started. Legal pages wait for `apps/web/src/content/legal.ts`; hosting, domain and the paid AI provider for API jobs are open decisions.

## Future plans

Requested 13 September 2026, not scheduled yet. Each needs a short design pass before building.

1. **URL shortener.** Short links on our own short domain, with click counts. Needs persistent storage (Redis for redirects, Postgres for owners and stats), a redirect route that stays fast, and abuse controls: Google Safe Browsing check on every destination, rate limits, a report link, and blocking of known phishing hosts. Open questions: anonymous links or only for signed-in users, and link expiry.
2. **Video format conversion** (MP4, MOV, WebM, MKV, AVI, animated GIF). ffmpeg on the worker for anything over a few MB; ffmpeg.wasm or WebCodecs in the browser for short clips. Decide the encoder licence first: the common H.264 encoder (libx264) is GPL, and H.264/HEVC carry patent pools; VP9/AV1 and remuxing without re-encoding avoid both. The 25 MB limit may need raising for video.
3. **MP3 to MP4 and MP4 to MP3.** Extract audio from a video (MP4, MOV, WebM to MP3, M4A, WAV), and turn audio into a video with a still image or waveform (for sharing on platforms that only accept video). Same ffmpeg path as item 2; LAME for MP3 is LGPL.
4. **Stamp maker** (design and add a stamp). Build a round, oval or rectangular stamp with Arabic and English text on a curve, a centre line, date and optional logo, in one ink colour with an optional worn texture; export transparent PNG and SVG; place it on PDFs with the existing signature placement. Runs in the browser. Add a notice that imitating government or third-party official seals is the user's legal responsibility.
5. **Download from Instagram, Facebook, TikTok and YouTube.** Needs a decision before any work. The terms of all four platforms prohibit downloading outside their own features, Google AdSense does not allow ads on pages that enable downloading YouTube content, and such sites attract copyright takedown notices, which also puts the Vercel account at risk. Because ads are a planned revenue source, this conflicts with the business model. Safer variants to consider: downloads only through official APIs for the user's own content, or leaving it out.

## Running the server tools locally

1. Redis: `redis-server --port 6379` (or `docker compose up redis`).
2. `apps/web/.env.local`: `REDIS_URL=redis://localhost:6379`, `JOBS_SECRET=<anything>`, `JOBS_DIR=~/alarab-jobs`. Without an S3 bucket the files live in that folder and the browser talks to `/api/files/...` with signed URLs.
3. `apps/worker/.env`: same three plus `GS_BIN`, `QPDF_BIN`, `SOFFICE_BIN`, `WORK_DIR` (keep it under `$HOME` for the LibreOffice snap) and `CHROME_CHANNEL=chrome`. Then `pnpm --filter worker start`.
4. Tests use their own Redis database so they never touch your saved provider keys or routing. Start the test web server and a test worker on database 15, then run the suite:
   ```bash
   REDIS_URL=redis://localhost:6379/15 AI_MOCK=1 pnpm exec next start -p 3117          # apps/web
   REDIS_URL=redis://localhost:6379/15 AI_MOCK=1 pnpm --filter worker start             # repo root
   SERVER_TOOLS=1 BASE_URL=http://localhost:3117 pnpm exec playwright test              # apps/web
   ```
   Shell variables override `.env.local` and `apps/worker/.env`. The gateway unit test always uses database 15 (or `AI_TEST_REDIS_URL`) and refuses to run on database 0.

Production: `docker compose up --build` gives Redis + MinIO + the worker image (`apps/worker/Dockerfile`, based on the Playwright image with LibreOffice, Ghostscript, qpdf, poppler and Arabic fonts). On Vercel set `REDIS_URL` (Upstash, `rediss://`) and the `S3_*` variables for R2; the worker gets the same variables wherever it runs. It needs no inbound ports.

## Deploying

See `docs/DEPLOY.md`: web app on Vercel (root directory `apps/web`), Upstash Redis and Cloudflare R2, and the worker as a Docker container on any Linux host. Business details for the legal pages go in `apps/web/src/content/legal.ts`.

## Admin dashboard

`/admin` is the owner's area. It needs `ADMIN_PASSWORD`, `ADMIN_SECRET` (signs the 12-hour session cookie), `KEYS_SECRET` (encrypts provider keys at rest; the worker needs the same value) and `REDIS_URL`. Signed-out visitors get a 404 for every admin page; the sign-in form is at `/admin` and is rate-limited to 5 attempts per 15 minutes per IP. Provider keys are written through the dashboard and never shown again (only the last four characters). Set `AI_MOCK=1` to expose a mock provider for tests; never set it in production or in the database your dashboard uses.

Models are not hard-coded. Each LLM adapter reads the provider's model list, picks from a preference list (Groq: `openai/gpt-oss-120b`, then Qwen 3; Groq retired its Llama chat models in September 2026) and retries once if a model disappears. The Test button shows the model in use. Override with `GROQ_MODEL`, `MISTRAL_MODEL`, `GEMINI_MODEL`, `CLOUDFLARE_TEXT_MODEL` or `CLOUDFLARE_TRANSLATE_MODEL` on the worker.

Deviation from the architecture doc, to revisit: keys are encrypted with a symmetric secret shared by the web app and the worker (the doc proposes a worker-only key pair), and sign-in is a password rather than a passkey.

## How a browser tool works

`ToolRunner` (client) collects files and options, then calls `src/lib/engine.ts`, which talks to `src/workers/pdf.worker.ts` over Comlink. The worker runs `@alarab/pdf-core` and returns `{name, bytes, mime}[]`; several outputs are zipped with fflate. Each tool's option form lives in `src/tools/` and is lazy-loaded so pages stay light.

Image tools run in a second worker (`src/workers/image.worker.ts`) on `@alarab/image-core`. The jSquash WASM codecs are not bundled: Turbopack's production build never finishes on their emscripten glue, so `scripts/copy-assets.mjs` copies the packages to `public/codecs/` and the worker imports them from there at runtime. The same folder holds libheif (HEIC decoding) and the MediaPipe vision runtime; the BlazeFace model lives in `public/models/` (Apache-2.0). Face detection runs on the main thread because MediaPipe's loader cannot run inside a module worker.

Checking Arabic output: render PDFs with poppler (`pdftoppm -png file.pdf out`), not LibreOffice. LibreOffice re-runs its own bidi layout on import and hides glyph-order bugs; poppler draws the glyphs exactly as the PDF places them.

Tools that need page previews use pdf.js on the main thread (`src/lib/pdfjs.ts`; its worker is copied to `public/` by `scripts/copy-assets.mjs`). A tool module can provide a `Workspace` component (page thumbnails, placement UI) and/or `runOnMain` to run with canvas instead of the PDF worker.
