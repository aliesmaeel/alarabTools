# Worker image: Node job runner + LibreOffice, Ghostscript, qpdf, poppler, Chromium and Arabic fonts.
# Build from the repo root:  docker build -f apps/worker/Dockerfile -t alarab-worker .
FROM mcr.microsoft.com/playwright:v1.50.0-noble AS base
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-core \
    ghostscript qpdf poppler-utils \
    fonts-noto-core fonts-noto-ui-core fonts-kacst fonts-sil-scheherazade fonts-hosny-amiri fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/tools/package.json packages/tools/
COPY packages/jobs/package.json packages/jobs/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter worker...

COPY packages/tools packages/tools
COPY packages/jobs packages/jobs
COPY apps/worker apps/worker

# Bundled fonts for text drawn by pdf-lib tools that may run here later.
COPY packages/arabic/fonts /usr/share/fonts/truetype/alarab
RUN fc-cache -f

ENV NODE_ENV=production \
    WORK_DIR=/work \
    CHROME_PATH=/ms-playwright/chromium-*/chrome-linux/chrome \
    SOFFICE_BIN=libreoffice
RUN mkdir -p /work && useradd -m -u 10001 runner && chown -R runner:runner /work /app
USER runner
# The image ships Chromium under /ms-playwright; resolve the glob once at start.
CMD ["sh", "-c", "export CHROME_PATH=$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome | head -1); cd apps/worker && pnpm start"]
