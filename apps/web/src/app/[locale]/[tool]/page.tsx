import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TOOLS, getTool, toolsInGroup, type Locale } from "@alarab/tools";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { SITE_NAME, alternates, localizedUrl } from "@/lib/site";
import { Dropzone } from "@/components/Dropzone";
import { RuntimeBadge } from "@/components/RuntimeBadge";
import { ToolCard } from "@/components/ToolCard";
import { ToolIcon } from "@/components/ToolIcon";

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => TOOLS.map((tool) => ({ locale, tool: tool.id })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; tool: string }> }): Promise<Metadata> {
  const { locale, tool: id } = await params;
  const tool = getTool(id);
  if (!tool) return {};
  const copy = tool.copy[locale as Locale];
  return {
    title: copy.name,
    description: copy.summary,
    alternates: { ...alternates(`/${id}`), canonical: localizedUrl(locale as Locale, `/${id}`) },
    openGraph: { title: `${copy.name} | ${SITE_NAME}`, description: copy.summary },
  };
}

export default async function ToolPage({ params }: PageProps<"/[locale]/[tool]">) {
  const { locale: raw, tool: id } = await params;
  const locale = raw as Locale;
  const tool = getTool(id);
  if (!tool) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();
  const copy = tool.copy[locale];
  const isBrowser = tool.runtime === "browser";
  const maxMb = Math.round(tool.limits.maxBytes / (1024 * 1024));
  const what = t(`tool.what.${tool.accepts[0] === "application/pdf" ? "pdf" : tool.accepts[0].startsWith("image/") ? "image" : "file"}`);
  const siblings = toolsInGroup(tool.group).filter((s) => s.id !== tool.id).slice(0, 6);
  const groupName = t(`groups.${tool.group}`);

  const faq = [
    { q: t("tool.faqFreeQ"), a: t("tool.faqFreeA", { maxMb }) },
    { q: t("tool.faqPrivacyQ"), a: t(isBrowser ? "tool.faqPrivacyBrowser" : "tool.faqPrivacyServer") },
  ];
  const steps = [t("tool.step1"), t(isBrowser ? "tool.step2Browser" : "tool.step2Server"), t("tool.step3")];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: copy.name,
      description: copy.summary,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      inLanguage: locale,
      url: localizedUrl(locale, `/${tool.id}`),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t("tool.breadcrumbHome"), item: localizedUrl(locale, "/") },
        { "@type": "ListItem", position: 2, name: groupName, item: localizedUrl(locale, `/#${tool.group}`) },
        { "@type": "ListItem", position: 3, name: copy.name, item: localizedUrl(locale, `/${tool.id}`) },
      ],
    },
  ];

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-10 px-4 py-8 sm:px-6 lg:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="breadcrumb" className="flex flex-wrap gap-2 text-sm text-ink-2">
        <Link href="/" className="text-ink-2 no-underline hover:text-lapis">{t("tool.breadcrumbHome")}</Link>
        <span aria-hidden>/</span>
        <Link href={`/#${tool.group}`} className="text-ink-2 no-underline hover:text-lapis">{groupName}</Link>
        <span aria-hidden>/</span>
        <span className="text-ink">{copy.name}</span>
      </nav>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <ToolIcon group={tool.group} size={56} />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{copy.name}</h1>
            <p className="max-w-[60ch] text-base text-ink-2">{copy.summary}</p>
          </div>
        </div>
        <RuntimeBadge runtime={tool.runtime} long />
      </header>

      <Dropzone accepts={tool.accepts} maxFiles={tool.limits.maxFiles} maxBytes={tool.limits.maxBytes} what={what} />

      <section className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t("tool.howTo", { name: copy.name })}</h2>
          <ol className="flex list-decimal flex-col gap-2 ps-6 text-ink-2 marker:font-semibold marker:text-lapis">
            {steps.map((s) => <li key={s} className="ps-1">{s}</li>)}
          </ol>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t("tool.faqTitle")}</h2>
          <dl className="flex flex-col gap-3">
            {faq.map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-line bg-surface p-4">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 text-sm text-ink-2">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {siblings.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t("tool.otherTools", { group: groupName })}</h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {siblings.map((s) => <ToolCard key={s.id} tool={s} locale={locale} />)}
          </div>
        </section>
      )}
    </main>
  );
}
