import { Link } from "@/i18n/navigation";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8 text-lg rounded-lg" : "size-9 text-[22px] rounded-[9px]";
  const text = size === "sm" ? "text-lg" : "text-[22px]";
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
      <span
        aria-hidden
        lang="ar"
        className={`${box} grid place-items-center bg-lapis font-display font-bold leading-none text-white`}
      >
        ع
      </span>
      <span dir="ltr" className={`${text} font-display font-semibold tracking-tight`}>
        alarab<span className="text-lapis">Tools</span>
      </span>
    </Link>
  );
}
