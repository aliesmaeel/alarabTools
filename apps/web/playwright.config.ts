import { defineConfig } from "@playwright/test";

// Uses the machine's installed Chrome (no browser download) via the "chrome" channel.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Server-tool specs share one Redis, one job worker and the AI provider settings; running them in
  // parallel lets one test's provider switch or queued LibreOffice job break another.
  workers: process.env.SERVER_TOOLS ? 1 : undefined,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    headless: true,
    acceptDownloads: true,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "pnpm exec next start -p 3000", url: "http://localhost:3000", reuseExistingServer: true, timeout: 60_000 },
});
