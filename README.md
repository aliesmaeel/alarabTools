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
packages/*        image-core, arabic, jobs, ui (later phases).
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
- Any text drawn into a PDF goes through `drawText` in `@alarab/arabic`, which splits bidi runs so Arabic joins and reads right-to-left. Never call `page.drawText` with Arabic directly.
- Fonts are in `packages/arabic/fonts` (source of truth) and copied to `apps/web/public/fonts`.

## Status

- P0 Foundation: done (registry, bilingual site, tool page template with SEO metadata and JSON-LD, sitemap, smoke test, CI).
- P1 Browser PDF tools: in progress. Working: merge, split, remove pages, extract pages, rotate, crop, protect, unlock, JPG to PDF, page numbers, watermark, Hijri date stamp.
  Remaining: organize (thumbnails), PDF to JPG, compare, scan to PDF, sign, edit, Arabic fonts.

## How a browser tool works

`ToolRunner` (client) collects files and options, then calls `src/lib/engine.ts`, which talks to `src/workers/pdf.worker.ts` over Comlink. The worker runs `@alarab/pdf-core` and returns `{name, bytes, mime}[]`; several outputs are zipped with fflate. Each tool's option form lives in `src/tools/` and is lazy-loaded so pages stay light.
