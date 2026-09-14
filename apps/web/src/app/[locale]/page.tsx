import { getTranslations, setRequestLocale } from "next-intl/server";
import { counts, getTool, groupedTools, type Locale } from "@alarab/tools";
import { Link } from "@/i18n/navigation";
import { ToolCard } from "@/components/ToolCard";

const POPULAR = ["merge-pdf", "pdf-to-word", "remove-background", "hijri-date-stamp"];

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const t = await getTranslations();
  const nf = new Intl.NumberFormat(locale);

  return (
    <main>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-14 sm:px-6 lg:px-10">
          <h1 className="max-w-[720px] font-display text-4xl font-semibold leading-tight text-balance sm:text-5xl">
            {t("home.title")}
          </h1>
          <p className="max-w-[620px] text-lg leading-relaxed text-ink-2">
            {t("home.lede", { count: nf.format(counts.ready) })}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="me-1 text-ink-2">{t("home.popular")}</span>
            {POPULAR.map((id) => {
              const tool = getTool(id)!;
              const tone = tool.group === "arabic" ? "bg-saffron-soft text-saffron-deep" : tool.group === "ai" ? "bg-teal-soft text-teal-deep" : "bg-lapis-soft text-lapis-deep";
              return (
                <Link key={id} href={`/${id}`} className={`rounded-full px-3 py-1.5 font-medium no-underline ${tone}`}>
                  {tool.copy[locale].name}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1280px] flex-col gap-12 px-4 py-10 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-2">
          <span className="flex items-center gap-2">
            <span className="rounded-md bg-teal-soft px-2 py-0.5 text-xs font-semibold text-teal-deep">{t("runtime.browser")}</span>
            {t("home.legendBrowser")}
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded-md bg-[#eceef4] px-2 py-0.5 text-xs font-semibold text-[#4a5068]">{t("runtime.server")}</span>
            {t("home.legendServer")}
          </span>
        </div>

        {groupedTools().map(({ group, tools }) => (
          <section key={group} id={group} className="flex scroll-mt-6 flex-col gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-semibold">{t(`groups.${group}`)}</h2>
              <span className="text-sm text-ink-2">{t("home.toolCount", { count: tools.length })}</span>
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} locale={locale} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
