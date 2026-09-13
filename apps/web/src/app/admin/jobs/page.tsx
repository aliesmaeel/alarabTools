import { notFound } from "next/navigation";
import { queueLength } from "@alarab/jobs";
import { auditLog, requestsToday } from "@alarab/ai";
import { isAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  if (!(await isAdmin())) notFound();
  const [queued, requests, log] = await Promise.all([queueLength(), requestsToday(), auditLog(50)]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Jobs and audit log</h1>
        <p className="text-sm text-ink-2">Job records and files expire after one hour, so there is no history of visitor jobs by design.</p>
      </div>
      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface sm:grid-cols-3">
        <div className="flex flex-col gap-0.5 border-r border-line px-5 py-4"><span className="text-xs text-ink-2">Waiting in queue</span><span className="text-2xl font-semibold tabular-nums">{queued}</span></div>
        <div className="flex flex-col gap-0.5 border-line px-5 py-4 sm:border-r"><span className="text-xs text-ink-2">AI requests today</span><span className="text-2xl font-semibold tabular-nums">{requests.toLocaleString("en")}</span></div>
        <div className="flex flex-col gap-0.5 px-5 py-4"><span className="text-xs text-ink-2">Storage</span><span className="text-2xl font-semibold">{process.env.S3_BUCKET ? "R2 / S3" : "local folder"}</span></div>
      </div>
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
        <span className="text-base font-semibold">Audit log</span>
        {log.length === 0 ? <p className="text-sm text-ink-2">Nothing yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-2"><th className="py-1 pr-4 font-medium">When</th><th className="py-1 pr-4 font-medium">Action</th><th className="py-1 pr-4 font-medium">Detail</th><th className="py-1 font-medium">IP</th></tr></thead>
              <tbody>
                {log.map((e, i) => (
                  <tr key={i} className="border-t border-line"><td className="py-1.5 pr-4 tabular-nums text-ink-2">{new Date(e.at).toLocaleString("en-GB")}</td><td className="py-1.5 pr-4 font-medium">{e.action}</td><td className="py-1.5 pr-4 text-ink-2">{e.detail ?? ""}</td><td className="py-1.5 font-mono text-xs text-ink-2">{e.ip}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
