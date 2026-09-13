# Deploying alarabTools

Written 13 September 2026. Three parts: the web app on Vercel, managed services (Upstash Redis, Cloudflare R2), and the worker on any Linux machine with Docker. The browser tools work with the web app alone; the server and AI tools need all three.

## 1. Web app on Vercel

1. Push the repository to GitHub (private is fine).
2. In Vercel: **Add New → Project → Import** the repository.
3. Settings on the import screen:
   - **Framework preset:** Next.js (detected).
   - **Root Directory:** `apps/web`. Leave "Include files outside the root directory" on (default), the app imports the workspace packages.
   - **Build command:** leave the default (`next build`). The `prebuild` script copies the codecs and fonts into `public/`.
   - **Install command:** leave the default; Vercel detects pnpm from `pnpm-lock.yaml`.
   - **Node.js version:** 22.x (Settings → General after the first deploy).
4. Environment variables (Settings → Environment Variables, apply to Production and Preview):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` (use the `*.vercel.app` URL until the domain is set) |
   | `REDIS_URL` | Upstash `rediss://default:<password>@<host>:6379` |
   | `ADMIN_PASSWORD` | a long password, 20+ characters |
   | `ADMIN_SECRET` | 32+ random characters (`openssl rand -base64 32`) |
   | `KEYS_SECRET` | 32+ random characters; the worker gets the same value |
   | `JOBS_SECRET` | 32+ random characters |
   | `S3_BUCKET` | `alarab-files` (the R2 bucket name) |
   | `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | the R2 API token pair |

   Leave `AI_MOCK` unset in production.
5. Deploy. The first build takes 2–3 minutes. Check `https://<app>.vercel.app/en/merge-pdf` (browser tool) and `https://<app>.vercel.app/admin` (sign-in page).

Notes:
- Vercel Hobby is for non-commercial use; move to Pro before ads or paid API access go live.
- The app never processes files on Vercel. Route handlers only create job records and sign URLs, so the 4.5 MB body limit is not hit.
- Without `REDIS_URL` the server tools show "coming soon" and the admin area returns 404.

## 2. Managed services

### Upstash Redis
1. upstash.com → Create database → region closest to the worker (Frankfurt if the worker runs in Europe or on your machine).
2. Copy the **TLS** connection string (`rediss://...`). Use it as `REDIS_URL` on Vercel and on the worker.
3. Free tier: 500K commands a month. The worker's queue wait is 25 s per command, about 100K commands a month idle; polling from the site adds one command per 1.5 s per running job.

### Cloudflare R2
1. dash.cloudflare.com → R2 → Create bucket `alarab-files`. No public access.
2. **Settings → CORS policy** on the bucket (uploads and downloads go straight from the browser):
   ```json
   [{ "AllowedOrigins": ["https://<your-domain>", "https://<app>.vercel.app"], "AllowedMethods": ["GET", "PUT", "HEAD"], "AllowedHeaders": ["content-type", "content-length"], "MaxAgeSeconds": 3600 }]
   ```
3. **Manage R2 API tokens → Create API token**: Object Read & Write, scoped to this bucket. Copy the Access Key ID and Secret Access Key.
4. Optional: Settings → Object lifecycle rule, delete objects after 1 day, as a backstop for the worker's hourly sweeper.

## 3. Worker

Any Linux host with Docker: this machine, a €5 VPS, or a Raspberry-class box is too small (LibreOffice and rembg want 2 GB RAM). No inbound ports are needed.

```bash
git clone <repo> alarabTools && cd alarabTools
cat > apps/worker/.env <<'EOF'
REDIS_URL=rediss://default:<password>@<host>:6379
KEYS_SECRET=<same as Vercel>
S3_BUCKET=alarab-files
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
EOF
docker build -f apps/worker/Dockerfile -t alarab-worker .
docker run -d --name alarab-worker --restart unless-stopped --env-file apps/worker/.env --memory 3g alarab-worker
docker logs -f alarab-worker   # expect: worker ready { storage: 's3' }
```

The image bundles LibreOffice, Ghostscript, qpdf, poppler, Chromium, Arabic fonts and rembg with its model (about 3 GB). Rebuild and restart after pulling changes. To run two workers, start a second container; the queue is shared.

Without Docker (development only), see the README section "Running the server tools locally".

## 4. After the first deploy

1. Open `/admin`, sign in, add provider keys from `docs/ACCOUNTS.md`, press **Test** on each.
2. Run one server tool (Compress PDF) and one AI tool (Summarize PDF) end to end.
3. Add the domain in Vercel → Settings → Domains, set `NEXT_PUBLIC_SITE_URL` to it, redeploy, and add the domain to the R2 CORS policy.
4. Turn on Vercel Analytics (Settings → Analytics) if wanted; no code change needed.

## Checklist before launch (P7)

- Privacy policy and terms pages (need `apps/web/src/content/legal.ts` filled in).
- Cloudflare Turnstile on job creation and admin sign-in.
- Vercel Pro (commercial use).
- AdSense and the developer API (Stripe).
