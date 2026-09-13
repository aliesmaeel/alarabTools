import type { ComponentType } from "react";
import type { RunResult } from "@/workers/pdf.worker";

export type Options = Record<string, unknown>;

export type OptionsProps<O extends Options = Options> = {
  value: O;
  onChange: (next: O) => void;
  /** Page count of the first PDF, once known. */
  pageCount: number | null;
  /** Number of files chosen. */
  fileCount: number;
};

export type WorkspaceProps<O extends Options = Options> = {
  files: File[];
  value: O;
  onChange: (next: O) => void;
};

export type ToolModule<O extends Options = Options> = {
  defaults: O;
  /** Replaces the plain file list with a tool-specific editor (page thumbnails, signature placement...). */
  Workspace?: ComponentType<WorkspaceProps<O>>;
  /** Run on the main thread instead of the PDF worker (tools that need canvas / pdf.js). */
  runOnMain?: (files: File[], options: O, onProgress: (done: number, total: number) => void) => Promise<RunResult>;
  /** Options form; omit for tools with no options. */
  Options?: ComponentType<OptionsProps<O>>;
  /** Transform options right before running (derive worker-facing fields). */
  prepare?: (o: O) => O;
  /** Return a message key under "options" when the options are not ready to run. */
  validate?: (o: O) => string | null;
  /** Tool takes typed input instead of files; the runner opens on the options panel. */
  noFiles?: boolean;
  /** Offer a "take photo" button (mobile camera) in the drop zone. */
  camera?: boolean;
  /** The Workspace IS the result (compare): no run button, no download. */
  noRun?: boolean;
  /** Whether files can be reordered (merge). */
  reorder?: boolean;
  /** ZIP name when there are several outputs. */
  zipName?: string;
};
