import type { Locale } from "@alarab/tools";

/** Canonical origin, no trailing slash. Set NEXT_PUBLIC_SITE_URL in Vercel once the domain is known. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "alarabTools";

/** Absolute URL for a localized path. Arabic (default) has no prefix. */
export function localizedUrl(locale: Locale, path = "/"): string {
  const p = path === "/" ? "" : path;
  return locale === "ar" ? `${SITE_URL}${p || "/"}` : `${SITE_URL}/${locale}${p}`;
}

/** hreflang map for a path, with Arabic as x-default. */
export function alternates(path = "/") {
  return {
    canonical: undefined as string | undefined,
    languages: {
      ar: localizedUrl("ar", path),
      en: localizedUrl("en", path),
      "x-default": localizedUrl("ar", path),
    },
  };
}
