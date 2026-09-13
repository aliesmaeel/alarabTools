// Copies runtime assets into public/ before dev/build:
// - pdf.js worker (must be served as a plain file)
// - bundled Arabic fonts (source of truth is packages/arabic/fonts)
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(import.meta.url);

const workerSrc = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
copyFileSync(workerSrc, join(root, "public", "pdf.worker.min.mjs"));

const fontsSrc = join(root, "..", "..", "packages", "arabic", "fonts");
const fontsDst = join(root, "public", "fonts");
mkdirSync(fontsDst, { recursive: true });
for (const f of readdirSync(fontsSrc)) copyFileSync(join(fontsSrc, f), join(fontsDst, f));

console.log("assets copied: pdf.js worker, fonts");
