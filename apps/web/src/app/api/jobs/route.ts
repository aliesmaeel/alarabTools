import { getTool } from "@alarab/tools";
import { createJob, hourPrefix, inputKey, newJobId, rateLimit, storage, type JobFile } from "@alarab/jobs";
import { clientIp, fail, json, serverToolsEnabled } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { tool?: string; locale?: string; files?: { name?: string; size?: number; type?: string }[]; options?: Record<string, unknown> };

/** Step 1 of a server job: validate, create the record, hand back signed upload URLs. */
export async function POST(req: Request) {
  if (!serverToolsEnabled()) return fail("not-configured", 503);
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("bad-json");
  }
  const tool = body.tool ? getTool(body.tool) : undefined;
  if (!tool || tool.runtime !== "server") return fail("unknown-tool", 404);
  const files = Array.isArray(body.files) ? body.files : [];
  const options = body.options && typeof body.options === "object" ? body.options : {};
  const needsFiles = tool.input !== "text" && !options.url;
  if (needsFiles && files.length === 0) return fail("no-files");
  if (files.length > tool.limits.maxFiles) return fail("too-many-files");
  for (const f of files) {
    if (!f.name || typeof f.size !== "number" || f.size <= 0) return fail("bad-file");
    if (f.size > tool.limits.maxBytes) return fail("too-large", 413);
    const type = f.type ?? "";
    if (type && !tool.accepts.includes(type) && !tool.accepts.includes("*/*")) return fail("bad-type", 415);
  }
  if (!(await rateLimit(`ip:${clientIp(req)}`, 30, 3600))) return fail("rate-limited", 429);

  const id = newJobId();
  const prefix = hourPrefix();
  const st = storage();
  const jobFiles: JobFile[] = files.map((f, i) => ({ key: inputKey(prefix, id, i, f.name!), name: f.name!, size: f.size!, type: f.type ?? "" }));
  await createJob({ id, tool: tool.id, locale: body.locale === "en" ? "en" : "ar", files: jobFiles, options, state: "created", progress: 0, createdAt: Date.now(), source: "web" });
  const uploads = await Promise.all(jobFiles.map((f) => st.putUrl(f.key, f.size, f.type)));
  return json({ id, uploads });
}
