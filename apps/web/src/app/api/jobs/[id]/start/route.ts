import { enqueue, getJob, setState, storage } from "@alarab/jobs";
import { fail, json, serverToolsEnabled } from "../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Step 2: the browser has uploaded every file; check they arrived with the declared sizes, then queue. */
export async function POST(_req: Request, ctx: RouteContext<"/api/jobs/[id]/start">) {
  if (!serverToolsEnabled()) return fail("not-configured", 503);
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return fail("not-found", 404);
  if (job.state !== "created") return json({ ok: true, state: job.state });
  const st = storage();
  for (const f of job.files) {
    const head = await st.head(f.key);
    if (!head) return fail("missing-upload", 409);
    if (head.size !== f.size) return fail("size-mismatch", 409);
  }
  await setState(id, "queued");
  await enqueue(id);
  return json({ ok: true, state: "queued" });
}
