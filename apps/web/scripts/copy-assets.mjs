// Copies runtime assets into public/ before dev/build:
// - pdf.js worker (must be served as a plain file)
// - bundled Arabic fonts (source of truth is packages/arabic/fonts)
// - jSquash image codecs (served as plain ESM + wasm; Turbopack's production build hangs on them)
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// Image codecs: copy each package as-is (relative imports keep working when served as files).
// The two that import the bare specifier `wasm-feature-detect` are rewritten to a relative path.
const imageCore = createRequire(join(root, "..", "..", "packages", "image-core", "package.json"));
const codecsDst = join(root, "public", "codecs");
rmSync(codecsDst, { recursive: true, force: true });
const CODECS = ["jpeg", "webp", "png", "oxipng", "resize"];
for (const name of CODECS) {
  const src = dirname(imageCore.resolve(`@jsquash/${name}/package.json`));
  cpSync(src, join(codecsDst, name), { recursive: true, filter: (p) => { const rel = p.slice(src.length); return !/\.(d\.ts|md)$/.test(rel) && !rel.includes("node_modules"); } });
}
const wfd = dirname(createRequire(imageCore.resolve("@jsquash/webp/package.json")).resolve("wasm-feature-detect/package.json"));
copyFileSync(join(wfd, "dist", "esm", "index.js"), join(codecsDst, "wasm-feature-detect.js"));
for (const f of ["webp/encode.js", "webp/decode.js", "oxipng/optimise.js"]) {
  const file = join(codecsDst, f);
  try {
    writeFileSync(file, readFileSync(file, "utf8").replace(/from ['"]wasm-feature-detect['"]/g, "from '../wasm-feature-detect.js'"));
  } catch { /* file may not exist in this version */ }
}

// HEIC decoder (ESM bundle with the wasm inlined) and MediaPipe vision runtime (loaded on the main thread).
mkdirSync(join(codecsDst, "heif"), { recursive: true });
copyFileSync(join(dirname(imageCore.resolve("libheif-js/package.json")), "libheif-wasm", "libheif-bundle.mjs"), join(codecsDst, "heif", "libheif.mjs"));
const mp = dirname(require.resolve("@mediapipe/tasks-vision"));
mkdirSync(join(codecsDst, "mediapipe"), { recursive: true });
copyFileSync(join(mp, "vision_bundle.mjs"), join(codecsDst, "mediapipe", "vision_bundle.mjs"));
cpSync(join(mp, "wasm"), join(codecsDst, "mediapipe", "wasm"), { recursive: true });

// Upscaler (TensorFlow.js + UpscalerJS + ESRGAN-slim models), loaded on the main thread by the upscale tool.
const up = join(codecsDst, "upscaler");
mkdirSync(join(up, "models"), { recursive: true });
copyFileSync(join(dirname(require.resolve("@tensorflow/tfjs/package.json")), "dist", "tf.min.js"), join(up, "tf.min.js"));
// These two packages hide package.json behind "exports"; the workspace symlinks are the stable way in.
copyFileSync(join(root, "node_modules", "upscaler", "dist", "browser", "umd", "upscaler.min.js"), join(up, "upscaler.min.js"));
const esrgan = join(root, "node_modules", "@upscalerjs", "esrgan-slim");
for (const x of ["x2", "x4"]) {
  copyFileSync(join(esrgan, "dist", "umd", "models", "esrgan-slim", "src", x, "index.min.js"), join(up, `esrgan-${x}.min.js`));
  cpSync(join(esrgan, "models", x), join(up, "models", x), { recursive: true });
}

console.log(`assets copied: pdf.js worker, fonts, codecs (${CODECS.join(", ")}, heif, mediapipe, upscaler)`);
