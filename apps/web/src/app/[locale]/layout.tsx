import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Reem_Kufi } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { counts } from "@alarab/tools";
import { routing } from "@/i18n/routing";
import { SITE_NAME, SITE_URL, alternates } from "@/lib/site";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "../globals.css";

const body = IBM_Plex_Sans_Arabic({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
});

const display = Reem_Kufi({
  variable: "--font-display",
  weight: ["500", "600", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("metaTitle"), template: `%s | ${SITE_NAME}` },
    description: t("metaDescription", { count: counts.ready }),
    alternates: alternates("/"),
    openGraph: { siteName: SITE_NAME, type: "website", locale: locale === "ar" ? "ar_AR" : "en_US" },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={`${body.variable} ${display.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
