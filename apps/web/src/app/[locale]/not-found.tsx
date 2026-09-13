import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <main className="mx-auto flex max-w-[640px] flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="text-ink-2">{t("body")}</p>
      <Link href="/" className="inline-flex h-11 items-center rounded-[10px] bg-lapis px-5 font-semibold text-white no-underline hover:bg-lapis-deep">
        {t("home")}
      </Link>
    </main>
  );
}
