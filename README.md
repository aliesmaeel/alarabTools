# alarabTools

Arabic-first (RTL) + English PDF and image tools, in the style of iLovePDF and iLoveIMG. 47 tools: 30 run in the browser, 17 on a worker.

Plans and decisions live in [docs/](docs/): the architecture document, the accounts to create, and the design mockups in [design/](design/).

## Layout

```
apps/web          Next.js 16 site (App Router, next-intl, Tailwind 4). Deploys to Vercel.
apps/worker       Job runner for server tools (phase P3, not started).
packages/tools    The tool registry: every page, badge, sitemap entry and API route reads from it.
packages/*        pdf-core, image-core, arabic, jobs, ui (later phases).
```

## Run it

```bash
pnpm install
pnpm --filter web dev          # http://localhost:3000 (Arabic), /en (English)
pnpm --filter @alarab/tools test
pnpm --filter web build && pnpm --filter web start
node apps/web/scripts/smoke.mjs   # checks every page in the sitemap against a running server
```

Copy `apps/web/.env.example` to `apps/web/.env.local`. Set `NEXT_PUBLIC_SITE_URL` to the real domain in Vercel so canonical URLs, hreflang and the sitemap are correct.

## Conventions

- URLs: Arabic is the default locale with no prefix (`/merge-pdf`); English is `/en/merge-pdf`. Slugs are Latin in both languages.
- Add a tool by adding one entry to `packages/tools/src/registry.ts`. Its pages, cards, sitemap entries and privacy badge appear automatically. The registry test enforces the counts.
- Use Tailwind logical utilities only (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`) so layouts mirror correctly in RTL.
- The privacy badge ("On your device" / "On our servers") comes from the tool's `runtime` field; never hard-code it.
- UI strings live in `apps/web/messages/{ar,en}.json`. Tool names and summaries live in the registry.

## Status

- P0 Foundation: done (registry, bilingual site, tool page template with SEO metadata and JSON-LD, sitemap, smoke test, CI).
- P1 Browser PDF tools: next.
