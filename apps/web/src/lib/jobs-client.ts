"use client";

import type { ToolDef } from "@alarab/tools";
import type { RunResult } from "@/workers/pdf.worker";

type Stage = "upload" | "queue" | "run";
type Progress = (done: number, total: number, stage?: Stage) => void;

type Created = { id: string; uploads: string[] };
type Status = { state: "created" | "queued" | "running" | "done" | "error"; progress: number; error?: string; result?: { name: string; size: number; type: string; url: string } };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `http-${res.status}`);
  return body;
}

/** PUT with upload progress (fetch has none). */
function putFile(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload-${xhr.status}`)));
    xhr.onerror = () => reject(new Error("upload-failed"));
    xhr.send(file);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a server tool: create the job, upload straight to storage with signed URLs, start it,
 * poll until it finishes, then fetch the result so the runner can offer it like any other output.
 */
export async function runServerJob(tool: ToolDef, files: File[], options: Record<string, unknown>, locale: string, onProgress: Progress): Promise<RunResult> {
  try {
    onProgress(0, 100, "upload");
    const created = await api<Created>("/api/jobs", { method: "POST", body: JSON.stringify({ tool: tool.id, locale, files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })), options }) });
    const totalBytes = files.reduce((a, f) => a + f.size, 0) || 1;
    let doneBytes = 0;
    for (let i = 0; i < files.length; i++) {
      let last = 0;
      await putFile(created.uploads[i], files[i], (fr) => {
        doneBytes += (fr - last) * files[i].size;
        last = fr;
        onProgress(Math.round((doneBytes / totalBytes) * 100), 100, "upload");
      });
    }
    await api(`/api/jobs/${created.id}/start`, { method: "POST" });
    onProgress(0, 100, "queue");

    const started = Date.now();
    for (;;) {
      await sleep(1500);
      const s = await api<Status>(`/api/jobs/${created.id}`);
      if (s.state === "done" && s.result) {
        onProgress(100, 100, "run");
        const res = await fetch(s.result.url);
        if (!res.ok) throw new Error("download-failed");
        const bytes = new Uint8Array(await res.arrayBuffer());
        void fetch(`/api/jobs/${created.id}`, { method: "DELETE" }).catch(() => {});
        return { ok: true, outputs: [{ name: s.result.name, bytes, mime: s.result.type }] };
      }
      if (s.state === "error") return { ok: false, code: "error", message: s.error ?? "failed" };
      if (s.state === "running") onProgress(Math.round((s.progress ?? 0) * 100), 100, "run");
      if (Date.now() - started > 10 * 60 * 1000) return { ok: false, code: "error", message: "timeout" };
    }
  } catch (e) {
    return { ok: false, code: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
