import { deleteJob, getJob, jobPrefix, storage } from "@alarab/jobs";
import { fail, json, serverToolsEnabled } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll a job. When done, the result carries a signed download URL (10 minutes). */
export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  if (!serverToolsEnabled()) return fail("not-configured", 503);
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return fail("not-found", 404);
  const result = job.result ? { name: job.result.name, size: job.result.size, type: job.result.type, url: await storage().getUrl(job.result.key, job.result.name) } : undefined;
  return json({ id: job.id, state: job.state, progress: job.progress, error: job.error, result });
}

/** "Delete now": remove the files and the record before the hour is up. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  if (!serverToolsEnabled()) return fail("not-configured", 503);
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return json({ ok: true });
  const anyKey = job.files[0]?.key ?? job.result?.key;
  if (anyKey) await storage().deletePrefix(jobPrefix(anyKey));
  await deleteJob(id);
  return json({ ok: true });
}
