import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

const POINTS = [
  ["AI providers", "Enter keys once; they are encrypted and never shown again."],
  ["Routing", "Order the free tiers per capability and set the safety margin."],
  ["Jobs and audit log", "Queue depth, AI requests today, and who changed what."],
];

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  if (await isAdmin()) redirect("/admin/providers");
  const sp = await searchParams;
  const signedOut = sp.signedout === "1";
  return (
    <div className="grid min-h-[70vh] items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col gap-8 rounded-2xl bg-lapis p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-white/15 text-2xl font-bold">ع</span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-semibold">alarabTools</span>
            <span className="text-sm text-white/70">Owner console</span>
          </span>
        </div>
        <p className="max-w-[420px] text-2xl font-semibold leading-snug">One place to manage the AI providers behind 47 tools, without touching the server.</p>
        <ul className="flex flex-col gap-4">
          {POINTS.map(([title, text]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-white/15">
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className="fill-none stroke-current stroke-[2.5]" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
              </span>
              <span className="flex flex-col"><span className="font-medium">{title}</span><span className="text-sm text-white/70">{text}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-auto text-xs text-white/50">Keys are written, never read back. Every change is logged with time and IP.</p>
      </section>
      <section className="flex justify-center">
        <div className="w-full max-w-[440px] rounded-2xl border border-line bg-surface p-7 shadow-sm sm:p-9">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-lapis text-lg font-bold text-white">ع</span>
            <span className="text-base font-semibold">alarabTools admin</span>
          </div>
          <LoginForm signedOut={signedOut} />
        </div>
      </section>
    </div>
  );
}
