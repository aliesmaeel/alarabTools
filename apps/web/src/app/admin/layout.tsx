import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import Link from "next/link";
import "../globals.css";
import { isAdmin } from "@/lib/admin-auth";
import { SignOut } from "@/components/admin/SignOut";

const body = IBM_Plex_Sans_Arabic({ variable: "--font-body", weight: ["400", "500", "600", "700"], subsets: ["arabic", "latin"], display: "swap" });

export const metadata: Metadata = { title: "alarabTools admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/providers", label: "AI providers" },
  { href: "/admin/routing", label: "Routing" },
  { href: "/admin/jobs", label: "Jobs and audit log" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const signedIn = await isAdmin();
  return (
    <html lang="en" dir="ltr" className={body.variable}>
      <body className="min-h-screen bg-ground font-sans text-ink">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <aside className="flex flex-col gap-6 border-b border-line bg-surface px-5 py-5 lg:w-[240px] lg:border-b-0 lg:border-r">
            <Link href="/admin" className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-lapis text-lg font-bold text-white">ع</span>
              <span className="flex flex-col leading-tight">
                <span className="text-base font-semibold">alarabTools</span>
                <span className="text-xs text-ink-2">Admin</span>
              </span>
            </Link>
            {signedIn && (
              <nav className="flex gap-1 lg:flex-col">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm font-medium text-ink hover:bg-ground">{n.label}</Link>
                ))}
              </nav>
            )}
            {signedIn && (
              <div className="mt-auto flex items-center justify-between text-xs text-ink-2">
                <span>Signed in with password</span>
                <SignOut />
              </div>
            )}
          </aside>
          <main className="flex-1 px-5 py-8 lg:px-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
