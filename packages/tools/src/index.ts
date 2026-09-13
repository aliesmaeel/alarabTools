import { TOOLS, MB } from "./registry.ts";
import { GROUPS, LOCALES } from "./types.ts";
import type { Locale, ToolDef, ToolGroup } from "./types.ts";

export * from "./types.ts";
export { TOOLS, MB };

const byId = new Map(TOOLS.map((t) => [t.id, t]));

export function getTool(id: string): ToolDef | undefined {
  return byId.get(id);
}

export function toolsInGroup(group: ToolGroup): ToolDef[] {
  return TOOLS.filter((t) => t.group === group);
}

/** Groups in display order, each with its tools. */
export function groupedTools(): { group: ToolGroup; tools: ToolDef[] }[] {
  return GROUPS.map((group) => ({ group, tools: toolsInGroup(group) }));
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Path for a tool page. Arabic is the default locale and has no prefix. */
export function toolPath(id: string, locale: Locale): string {
  return locale === "ar" ? `/${id}` : `/${locale}/${id}`;
}

export const counts = {
  total: TOOLS.length,
  browser: TOOLS.filter((t) => t.runtime === "browser").length,
  server: TOOLS.filter((t) => t.runtime === "server").length,
};
