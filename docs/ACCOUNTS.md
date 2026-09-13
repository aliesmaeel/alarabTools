# Accounts to create

Written 13 September 2026. Free-tier limits change often; check each provider's page when you sign up.

## Before you start

- Use one email for all accounts, ideally a project address on your domain (for example `dev@[yourdomain]`).
- Turn on two-factor sign-in everywhere.
- Never paste keys into chat, code or docs. Keep them in a password manager until the admin dashboard exists, then enter them there (`/admin` → AI providers).
- **One account per provider.** Opening several accounts with the same provider to multiply free quota breaks OpenRouter's terms outright and likely Google's, Groq's and Cerebras's. Load is balanced across different providers only.

## AI providers (free tiers), in priority order

| # | Account | Where | Card needed? | What the dashboard asks for | Free allowance (Sept 2026) | Trains on data? |
|---|---|---|---|---|---|---|
| 1 | **Groq** | console.groq.com → API Keys | No | API key (`gsk_…`) | 30 req/min, 1K req/day, 200K tokens/day | No |
| 2 | **Cloudflare** | dash.cloudflare.com | No | Account ID + API token with "Workers AI" permission (later also Images, R2, Turnstile) | Workers AI 10K neurons/day; Images 5K transformations/month | No |
| 3 | **Microsoft Azure** | portal.azure.com | Yes, plus phone check | Two free (F0) resources: **Translator** (key + region) and **Document Intelligence** (endpoint + key) | Translator 2M chars/month; Document Intelligence 500 pages/month (first 2 pages per request) | No |
| 4 | **Google Cloud** | console.cloud.google.com | Yes (billing account) | One project with **Cloud Vision API** and **Cloud Translation API** enabled; one API key restricted to those two APIs | Vision 1,000 pages/month; Translation about 500K chars/month via a $10 monthly credit | No |
| 5 | **OCR.space** | ocr.space/ocrapi → free key | No | API key (sent by email) | 25K requests/month, 1 MB and 3 pages per request | No |
| 6 | **Google AI Studio (Gemini)** | aistudio.google.com → Get API key | No | API key | Shown only in the dashboard | **Yes, with human review** |

### Traps to avoid

- **Google Cloud (#4):** set a budget alert of $1 under Billing → Budgets. The gateway stops before the free limit, but the alert is your safety net.
- **Gemini (#6):** create its key in a **separate Google project with no billing**. If billing is on for the project, usage may be charged instead of free.
- **Azure (#3):** pick the **F0 (free)** pricing tier for both resources; the paid S tier is easy to click by mistake.
- **Cloudflare (#2):** background removal most likely needs your domain added to Cloudflare, which you'll want anyway for R2 and Turnstile.

### How the site uses them

- Providers that don't train on data go first. Gemini is always last.
- Gemini serves visitors **outside** the EU, EEA, UK and Switzerland only, and is never used for OCR, PDF to Word or developer API jobs.
- Developer API jobs never use free tiers; they go to a paid provider charged to the customer's credits.

## Optional AI providers

- **Mistral** (console.mistral.ai): backup for summaries and translation. Turn off training on your data in the admin settings before adding the key.
- **OpenRouter**: only 50 free requests a day; low priority.
- **DeepSeek** (platform.deepseek.com): paid only, roughly $0.01 per 50-page summary. A candidate for developer API jobs. Data is stored in China; decide before using it.

## Not used, and why

| Service | Reason |
|---|---|
| GitHub Models | Shut down on 30 July 2026 |
| Cohere trial, NVIDIA trial | Terms forbid production or commercial use |
| Cerebras | One-time 30-day trial, not an ongoing free tier |
| remove.bg | API moves to Leonardo.Ai on 1 December 2026; keys and credits don't carry over |
| DeepL API Free | Being phased out; new plan is a one-time 1M characters |
| AWS Textract | No Arabic support |
| Hugging Face Inference | Only $0.10/month of free credit |

## Other accounts the project needs (not AI)

| Account | For | When |
|---|---|---|
| **Vercel** (Hobby while building) | Hosting the Next.js site | P0 |
| **Cloudflare R2** (same Cloudflare account) | File storage for server tools, 1-hour deletion | P3 |
| **Cloudflare Turnstile** | Bot protection on server jobs and admin | P3 |
| **Upstash** | Redis: job queue, job state, rate limits | P3 |
| **Neon** | Postgres: developer accounts, API keys, credits, provider keys | P4 |
| **Stripe or Paddle** | Developer API payments (check Stripe availability in your country first) | P6 |
| **Google AdSense** | Ads | P7 |
