"use client";

import * as Comlink from "comlink";
import type { PdfWorkerApi, ProgressFn, RunResult, Output } from "@/workers/pdf.worker";

export type { RunResult, Output };

let worker: Worker | null = null;
let remote: Comlink.Remote<PdfWorkerApi> | null = null;

/** One worker per page, created on first use so tool pages stay light until a file is chosen. */
function get(): Comlink.Remote<PdfWorkerApi> {
  if (!remote) {
    worker = new Worker(new URL("../workers/pdf.worker.ts", import.meta.url), { type: "module" });
    remote = Comlink.wrap<PdfWorkerApi>(worker);
  }
  return remote;
}

export function warmUp() {
  get();
}

export function pageCount(file: File): Promise<number | null> {
  return get().pageCount(file);
}

export function run(toolId: string, files: File[], options: Record<string, unknown>, onProgress: ProgressFn): Promise<RunResult> {
  return get().run(toolId, files, options, Comlink.proxy(onProgress));
}
