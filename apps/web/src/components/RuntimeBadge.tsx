import { useTranslations } from "next-intl";
import type { Runtime } from "@alarab/tools";

/** The privacy badge. Its text comes from the registry's runtime, so the claim can't drift from the code. */
export function RuntimeBadge({ runtime, long = false }: { runtime: Runtime; long?: boolean }) {
  const t = useTranslations("runtime");
  const isBrowser = runtime === "browser";
  const cls = isBrowser ? "bg-teal-soft text-teal-deep" : "bg-[#eceef4] text-[#4a5068]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${cls} ${long ? "px-3 py-1.5 text-sm font-medium" : ""}`}>
      {long && (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round">
          {isBrowser ? (
            <>
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </>
          ) : (
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </>
          )}
        </svg>
      )}
      {t(long ? (isBrowser ? "browserLong" : "serverLong") : isBrowser ? "browser" : "server")}
    </span>
  );
}
