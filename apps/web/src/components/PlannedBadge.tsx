import { useTranslations } from "next-intl";

/** Marks a tool whose page and form exist but which does not run yet (registry status "planned"). */
export function PlannedBadge({ long = false }: { long?: boolean }) {
  const t = useTranslations("tool");
  return (
    <span className={`inline-flex items-center rounded-md bg-saffron-soft px-2 py-0.5 text-xs font-semibold text-saffron-deep ${long ? "px-3 py-1.5 text-sm font-medium" : ""}`}>
      {t("plannedBadge")}
    </span>
  );
}
