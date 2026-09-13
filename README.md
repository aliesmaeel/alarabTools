# alarabTools

Arabic-first (RTL) + English PDF and image tools, in the style of iLovePDF and iLoveIMG. 47 tools: 30 run in the browser, 17 on a worker.

Plans and decisions live in [docs/](docs/): the architecture document, the accounts to create, and the design mockups in [design/](design/).

## Layout

```
apps/web          Next.js 16 site (App Router, next-intl, Tailwind 4). Deploys to Vercel.
apps/worker       Job runner for server tools (phase P3, not started).
packages/tools    The tool registry: every page, badge, sitemap entry and API route reads from it.
packages/pdf-core pdf-lib operations shared by the browser worker and (later) the API worker.
packages/arabic   Bidi + shaping-aware text drawing, digits, Hijri dates, bundled OFL fonts.
packages/image-core Decode/resize/encode on ImageData; jSquash codecs (mozjpeg, libwebp, oxipng) loaded at runtime.
packages/*        jobs, ui (later phases).
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

- P0 Foundation: done (registry, bilingual site, tool page template with SEO metadata and JSON-LD, sitemap, smoke test, CI).
- P1 Browser PDF tools: done (19): merge, split, remove pages, extract pages, organize, scan to PDF, rotate, crop, protect, unlock, sign, compare, JPG to PDF, PDF to JPG, page numbers, watermark (text or logo), Hijri date stamp, Arabic fonts (text to PDF/PNG), edit PDF (text, images, drawing, shapes, highlight, whiteout).
- P2 Browser image tools: done (10): compress, resize, convert to JPG, convert from JPG (PNG/WebP), rotate/flip, crop, watermark (text or logo), meme generator, blur faces, photo editor (presets, adjustments, Arabic text, stickers, frames). HEIC/HEIF input works in every image tool (libheif). Upscale is P5.

## How a browser tool works

`ToolRunner` (client) collects files and options, then calls `src/lib/engine.ts`, which talks to `src/workers/pdf.worker.ts` over Comlink. The worker runs `@alarab/pdf-core` and returns `{name, bytes, mime}[]`; several outputs are zipped with fflate. Each tool's option form lives in `src/tools/` and is lazy-loaded so pages stay light.

Image tools run in a second worker (`src/workers/image.worker.ts`) on `@alarab/image-core`. The jSquash WASM codecs are not bundled: Turbopack's production build never finishes on their emscripten glue, so `scripts/copy-assets.mjs` copies the packages to `public/codecs/` and the worker imports them from there at runtime. The same folder holds libheif (HEIC decoding) and the MediaPipe vision runtime; the BlazeFace model lives in `public/models/` (Apache-2.0). Face detection runs on the main thread because MediaPipe's loader cannot run inside a module worker.

Checking Arabic output: render PDFs with poppler (`pdftoppm -png file.pdf out`), not LibreOffice. LibreOffice re-runs its own bidi layout on import and hides glyph-order bugs; poppler draws the glyphs exactly as the PDF places them.

Tools that need page previews use pdf.js on the main thread (`src/lib/pdfjs.ts`; its worker is copied to `public/` by `scripts/copy-assets.mjs`). A tool module can provide a `Workspace` component (page thumbnails, placement UI) and/or `runOnMain` to run with canvas instead of the PDF worker.
