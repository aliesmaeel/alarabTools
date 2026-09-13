import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { LocaleSwitch } from "./LocaleSwitch";

export async function Header() {
  const t = await getTranslations("nav");
  const links = [
    { href: "/#organize", label: t("pdf") },
    { href: "/#image", label: t("images") },
    { href: "/#ai", label: t("ai") },
    { href: "/#arabic", label: t("arabic") },
  ] as const;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-7 text-[15px] font-medium md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-ink no-underline hover:text-lapis">
                {l.label}
              </Link>
            ))}
            <Link href="/developers" className="text-ink-2 no-underline hover:text-lapis">
              {t("developers")}
            </Link>
          </nav>
        </div>
        <LocaleSwitch />
      </div>
    </header>
  );
}
