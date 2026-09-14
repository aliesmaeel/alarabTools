import type { Locale, ToolDef } from "@alarab/tools";
import { Link } from "@/i18n/navigation";
import { ToolIcon } from "./ToolIcon";
import { RuntimeBadge } from "./RuntimeBadge";
import { PlannedBadge } from "./PlannedBadge";

export function ToolCard({ tool, locale }: { tool: ToolDef; locale: Locale }) {
  const copy = tool.copy[locale];
  return (
    <Link
      href={`/${tool.id}`}
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 text-ink no-underline transition hover:-translate-y-0.5 hover:border-lapis hover:shadow-[0_12px_24px_-16px_rgba(22,27,47,0.35)]"
    >
      <div className="flex items-center justify-between gap-2">
        <ToolIcon group={tool.group} />
        {tool.status === "planned" ? <PlannedBadge /> : <RuntimeBadge runtime={tool.runtime} />}
      </div>
      <span className="text-base font-semibold">{copy.name}</span>
      <span className="text-[13px] leading-relaxed text-ink-2">{copy.summary}</span>
    </Link>
  );
}
