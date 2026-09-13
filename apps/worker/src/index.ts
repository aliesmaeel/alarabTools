/**
 * Job runner. Takes ids off the Redis queue, downloads inputs, runs the tool with a hard timeout,
 * uploads the result and updates the record. A sweeper deletes files older than one hour.
 */
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { getTool } from "@alarab/tools";
import { JOB_TIMEOUT, JOB_TTL, blockingRedis, expiredHourPrefixes, getJob, jobPrefix, outputKey, releaseJob, requeueStale, setState, storage, takeJob, updateJob, type JobRecord } from "@alarab/jobs";
import { ToolError } from "./exec";
import { loadTool, type ToolOutput } from "./tools/index";

const WORK_DIR = process.env.WORK_DIR || join(process.env.HOME ?? "/tmp", "alarab-work");
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function zipOutputs(dir: string, outputs: ToolOutput[], name: string): Promise<ToolOutput> {
  const { zipSync } = await import("fflate");
  const { readFile } = await import("node:fs/promises");
  const entries: Record<string, Uint8Array> = {};
  for (const o of outputs) entries[o.name] = await readFile(o.path);
  const path = join(dir, name);
  await new Promise<void>((res, rej) => { const ws = createWriteStream(path); ws.on("error", rej); ws.end(zipSync(entries, { level: 6 }), () => res()); });
  return { path, name, type: "application/zip" };
}

async function process1(job: JobRecord): Promise<void> {
  const st = storage();
  const dir = join(WORK_DIR, job.id);
  await mkdir(dir, { recursive: true });
  try {
    const tool = getTool(job.tool);
    const impl = tool ? await loadTool(job.tool) : null;
    if (!tool || !impl) throw new ToolError("unknown-tool");
    await setState(job.id, "running", { startedAt: Date.now(), progress: 0 });
    const inputs: string[] = [];
    for (let i = 0; i < job.files.length; i++) {
      const p = join(dir, `in-${i}.${job.files[i].key.split(".").pop()}`);
      await st.download(job.files[i].key, p);
      if ((await stat(p)).size > tool.limits.maxBytes) throw new ToolError("too-large");
      inputs.push(p);
    }
    let lastReported = 0;
    const progress = (f: number) => {
      const now = Date.now();
      if (now - lastReported > 700 || f >= 1) { lastReported = now; void updateJob(job.id, { progress: Math.min(1, Math.max(0, f)) }); }
    };
    const outputs = await Promise.race([
      impl({ job, dir, inputs, progress }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new ToolError("timeout")), JOB_TIMEOUT * 1000)),
    ]);
    if (!outputs.length) throw new ToolError("failed", "no output");
    const one = outputs.length === 1 ? outputs[0] : await zipOutputs(dir, outputs, `${job.tool}.zip`);
    const key = outputKey(jobPrefix(job.files[0]?.key ?? `jobs/${new Date().toISOString().slice(0, 13)}/${job.id}/in/x`), job.id, one.name);
    const { size } = await st.upload(one.path, key, one.type);
    await setState(job.id, "done", { progress: 1, finishedAt: Date.now(), result: { key, name: one.name, size, type: one.type } });
    log("done", job.id, job.tool, `${size} B`);
  } catch (e) {
    const code = e instanceof ToolError ? e.code : "failed";
    log("error", job.id, job.tool, code, e instanceof Error ? e.message.slice(0, 300) : e);
    await setState(job.id, "error", { error: code, finishedAt: Date.now() });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function sweep(): Promise<void> {
  try {
    const st = storage();
    for (const prefix of expiredHourPrefixes(JOB_TTL)) {
      const n = await st.deletePrefix(prefix);
      if (n) log("swept", prefix, n);
    }
  } catch (e) {
    log("sweep failed", e instanceof Error ? e.message : e);
  }
}

async function main() {
  await mkdir(WORK_DIR, { recursive: true });
  const requeued = await requeueStale();
  if (requeued) log("requeued", requeued);
  const conn = blockingRedis();
  await sweep();
  setInterval(sweep, 10 * 60 * 1000);
  log("worker ready", { WORK_DIR, storage: process.env.S3_BUCKET ? "s3" : "local" });
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  while (!stopping) {
    const id = await takeJob(conn, 25);
    if (!id) continue;
    const job = await getJob(id);
    if (job && job.state === "queued") await process1(job);
    else log("skip", id, job?.state ?? "expired");
    await releaseJob(id);
  }
  log("worker stopped");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
