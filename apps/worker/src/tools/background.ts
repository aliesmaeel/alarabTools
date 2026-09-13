import { join } from "node:path";
import { stat } from "node:fs/promises";
import { run, ToolError } from "../exec";
import { base, type ServerTool, type ToolOutput } from "./index";

/**
 * Background removal with rembg (MIT; models: isnet-general-use by default). Self-hosted on the worker,
 * so images never leave it. REMBG_BIN points at the CLI (a Python venv locally, /usr/local/bin in Docker).
 */
const REMBG = process.env.REMBG_BIN || "rembg";

export const removeBackground: ServerTool = async ({ job, dir, inputs, progress }) => {
  try {
    await stat(REMBG);
  } catch {
    if (REMBG.includes("/")) throw new ToolError("no-provider", "rembg is not installed on this worker");
  }
  const model = ["isnet-general-use", "u2net", "u2net_human_seg", "birefnet-general"].includes(String(job.options.model)) ? String(job.options.model) : "isnet-general-use";
  const outputs: ToolOutput[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const out = join(dir, `cutout-${i}.png`);
    const args = ["i", "-m", model];
    if (job.options.alphaMatting === true) args.push("-a");
    args.push(inputs[i], out);
    await run(REMBG, args, { cwd: dir, timeoutMs: 4 * 60 * 1000, env: { OMP_NUM_THREADS: "2" } });
    outputs.push({ path: out, name: `${base(job.files[i].name)}-no-bg.png`, type: "image/png" });
    progress((i + 1) / inputs.length);
  }
  return outputs;
};
