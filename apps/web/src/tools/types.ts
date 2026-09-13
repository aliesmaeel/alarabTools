import type { ComponentType } from "react";

export type Options = Record<string, unknown>;

export type OptionsProps<O extends Options = Options> = {
  value: O;
  onChange: (next: O) => void;
  /** Page count of the first PDF, once known. */
  pageCount: number | null;
  /** Number of files chosen. */
  fileCount: number;
};

export type ToolModule<O extends Options = Options> = {
  defaults: O;
  /** Options form; omit for tools with no options. */
  Options?: ComponentType<OptionsProps<O>>;
  /** Return a message key under "options" when the options are not ready to run. */
  validate?: (o: O) => string | null;
  /** Tool takes typed input instead of files; the runner opens on the options panel. */
  noFiles?: boolean;
  /** Whether files can be reordered (merge). */
  reorder?: boolean;
  /** ZIP name when there are several outputs. */
  zipName?: string;
};
