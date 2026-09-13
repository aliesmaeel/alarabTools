"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const ITEMS = [
  { href: "/admin/providers", label: "AI providers", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/admin/routing", label: "Routing", icon: "M4 7h7l3 5-3 5H4M14 7h6M14 17h6M17 4v6M17 14v6" },
  { href: "/admin/jobs", label: "Jobs and audit log", icon: "M4 5h16v14H4zM8 9h8M8 13h5" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((n) => {
        const active = pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-lapis-soft text-lapis-deep" : "text-ink hover:bg-ground"}`}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountMenu() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      location.href = "/admin?signedout=1";
    }
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-ground/60 p-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lapis text-sm font-bold text-white">ع</span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium">Owner</span>
        <span className="truncate text-xs text-ink-2">Password session</span>
      </span>
      <button type="button" onClick={signOut} disabled={busy} title="Sign out" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-surface px-2.5 text-xs font-medium hover:border-ink-3 disabled:opacity-50">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3M13 4h6v16h-6" /></svg>
        {busy ? "…" : "Sign out"}
      </button>
    </div>
  );
}
