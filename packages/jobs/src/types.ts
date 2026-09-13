/** Shared job model for the web API routes and the worker. Records live in Redis for one hour. */

export type JobState = "created" | "queued" | "running" | "done" | "error";

export type JobFile = {
  /** Storage key. */
  key: string;
  /** Original file name (may be Arabic). */
  name: string;
  size: number;
  type: string;
};

export type JobResult = { key: string; name: string; size: number; type: string };

export type JobRecord = {
  id: string;
  tool: string;
  locale: "ar" | "en";
  files: JobFile[];
  options: Record<string, unknown>;
  state: JobState;
  /** 0..1 while running. */
  progress: number;
  result?: JobResult;
  /** Error code for the UI ("failed", "timeout", "undecodable", "too-large"...). */
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Where the job came from: the site or a developer API key id. */
  source: "web" | "api";
};

/** Seconds a job record and its files live. */
export const JOB_TTL = 60 * 60;
/** Seconds an upload/download URL stays valid. */
export const URL_TTL = 10 * 60;
/** Seconds a job may run before the worker kills it. */
export const JOB_TIMEOUT = 5 * 60;
