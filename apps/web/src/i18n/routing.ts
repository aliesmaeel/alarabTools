import { defineRouting } from "next-intl/routing";
import { LOCALES } from "@alarab/tools";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "ar",
  // Arabic lives at /merge-pdf, English at /en/merge-pdf.
  localePrefix: "as-needed",
  // Never guess from Accept-Language: the URL is the only source of truth for SEO.
  localeDetection: false,
});
