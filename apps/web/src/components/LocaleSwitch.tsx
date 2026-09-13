"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";

export function LocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname(); // locale-agnostic, e.g. "/merge-pdf"
  const t = useTranslations("site");
  const other = locale === "ar" ? "en" : "ar";
  // Built by hand so the Arabic link has no prefix and no redirect hop.
  const href = other === "ar" ? pathname : `/en${pathname === "/" ? "" : pathname}`;
  return (
    <Link
      href={href}
      hrefLang={other}
      lang={other}
      className="flex h-10 items-center gap-2 rounded-lg border border-line-2 bg-surface px-3.5 text-sm font-medium text-ink no-underline hover:border-ink-3"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
      </svg>
      <span>{t("switchLocale")}</span>
    </Link>
  );
}
