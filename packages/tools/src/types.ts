export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const GROUPS = [
  "organize",
  "optimize",
  "to-pdf",
  "from-pdf",
  "edit",
  "image",
  "ai",
  "arabic",
] as const;
export type ToolGroup = (typeof GROUPS)[number];

/** Where the file processing happens. "browser": never uploaded. "server": worker + R2, deleted after 1 hour. */
export type Runtime = "browser" | "server";

export interface ToolCopy {
  /** Tool name as shown in navigation, cards and the page title. */
  name: string;
  /** One sentence for cards and meta description. */
  summary: string;
}

export interface ToolDef {
  /** URL slug, Latin in both languages: /merge-pdf and /en/merge-pdf. */
  id: string;
  group: ToolGroup;
  runtime: Runtime;
  /** What the visitor provides. "files" (default) or "text" typed into the page. */
  input?: "files" | "text";
  /** Accepted MIME types (for "files" input). */
  accepts: readonly string[];
  limits: { maxFiles: number; maxBytes: number };
  /** Developer API mapping; credits charged per job. */
  api: { path: string; credits: number };
  /** Build phase from the roadmap (P1–P5). */
  phase: 1 | 2 | 3 | 4 | 5;
  copy: Record<Locale, ToolCopy>;
}
