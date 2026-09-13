import type { MetadataRoute } from "next";
import { LOCALES, TOOLS } from "@alarab/tools";
import { localizedUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", ...TOOLS.map((t) => `/${t.id}`)];
  return paths.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: localizedUrl(locale, path),
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : 0.8,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, localizedUrl(l, path)])),
      },
    })),
  );
}
