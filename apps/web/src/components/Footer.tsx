import { getLocale, getTranslations } from "next-intl/server";
import { getTool, type Locale } from "@alarab/tools";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";

const PDF_LINKS = ["merge-pdf", "compress-pdf", "pdf-to-word"];
const IMAGE_LINKS = ["compress-image", "remove-background", "convert-to-jpg"];

export async function Footer() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const year = new Intl.NumberFormat(locale, { useGrouping: false }).format(new Date().getFullYear());

  const col = (ids: string[], allLabel: string, allHref: string) => (
    <ul className="flex flex-col gap-2.5">
      {ids.map((id) => {
        const tool = getTool(id)!;
        return (
          <li key={id}>
            <Link href={`/${id}`} className="text-ink-2 no-underline hover:text-lapis">
              {tool.copy[locale].name}
            </Link>
          </li>
        );
      })}
      <li>
        <Link href={allHref} className="text-ink-2 no-underline hover:text-lapis">
          {allLabel}
        </Link>
      </li>
    </ul>
  );

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-12 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-10">
        <div className="flex flex-col gap-3">
          <Logo size="sm" />
          <p className="max-w-[300px] text-ink-2">{t("site.tagline")}</p>
          <span className="text-ink-3">{t("footer.rights", { year })}</span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="font-semibold">{t("nav.pdf")}</span>
          {col(PDF_LINKS, t("footer.allPdf"), "/#organize")}
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="font-semibold">{t("nav.images")}</span>
          {col(IMAGE_LINKS, t("footer.allImages"), "/#image")}
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="font-semibold">alarabTools</span>
          <ul className="flex flex-col gap-2.5">
            <li><Link href="/developers" className="text-ink-2 no-underline hover:text-lapis">{t("nav.developers")}</Link></li>
            <li><Link href="/privacy" className="text-ink-2 no-underline hover:text-lapis">{t("footer.privacy")}</Link></li>
            <li><Link href="/terms" className="text-ink-2 no-underline hover:text-lapis">{t("footer.terms")}</Link></li>
            <li><Link href="/contact" className="text-ink-2 no-underline hover:text-lapis">{t("footer.contact")}</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
