import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import Link from "next/link";
import "../globals.css";
import { isAdmin } from "@/lib/admin-auth";
import { AccountMenu, AdminNav } from "@/components/admin/AdminNav";

const body = IBM_Plex_Sans_Arabic({ variable: "--font-body", weight: ["400", "500", "600", "700"], subsets: ["arabic", "latin"], display: "swap" });

export const metadata: Metadata = { title: "alarabTools admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const signedIn = await isAdmin();
  return (
    <html lang="en" dir="ltr" className={body.variable}>
      <body className="min-h-screen bg-ground font-sans text-ink">
        {signedIn ? (
          <div className="flex min-h-screen flex-col lg:flex-row">
            <aside className="flex flex-col gap-6 border-b border-line bg-surface px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-[250px] lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
              <Link href="/admin/providers" className="flex items-center gap-2.5 px-1">
                <span className="grid size-9 place-items-center rounded-lg bg-lapis text-lg font-bold text-white">ع</span>
                <span className="flex flex-col leading-tight">
                  <span className="text-base font-semibold">alarabTools</span>
                  <span className="text-xs text-ink-2">Admin</span>
                </span>
              </Link>
              <AdminNav />
              <div className="lg:mt-auto">
                <AccountMenu />
              </div>
            </aside>
            <main className="flex-1 px-5 py-8 lg:px-10">{children}</main>
          </div>
        ) : (
          <main className="mx-auto w-full max-w-[1100px] px-5 py-10">{children}</main>
        )}
      </body>
    </html>
  );
}
