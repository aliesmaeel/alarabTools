import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { LocalStorage, contentDisposition, localVerify, storage } from "@alarab/jobs";
import { fail } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Local-folder storage only (development, CI): the browser uploads to and downloads from here with
 * HMAC-signed URLs. With R2 configured these requests never happen; the URLs point at R2 itself.
 */
function local(): LocalStorage | null {
  const s = storage();
  return s instanceof LocalStorage ? s : null;
}

export async function PUT(req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const st = local();
  if (!st) return fail("not-found", 404);
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const q = new URL(req.url).searchParams;
  const size = Number(q.get("size")), exp = Number(q.get("exp")), type = q.get("type") ?? "";
  if (!localVerify(q.get("sig") ?? "", key, "PUT", exp, size, type)) return fail("bad-signature", 403);
  if (!req.body) return fail("no-body");
  const dest = st.path(key);
  await mkdir(dirname(dest), { recursive: true });
  let received = 0;
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > size) controller.error(new Error("too-large"));
      else controller.enqueue(chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body.pipeThrough(limiter) as import("node:stream/web").ReadableStream), createWriteStream(dest));
  } catch {
    return fail("too-large", 413);
  }
  if (received !== size) return fail("size-mismatch", 400);
  return new Response(null, { status: 200 });
}

export async function GET(req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const st = local();
  if (!st) return fail("not-found", 404);
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const q = new URL(req.url).searchParams;
  if (!localVerify(q.get("sig") ?? "", key, "GET", Number(q.get("exp")))) return fail("bad-signature", 403);
  const path = st.path(key);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return fail("not-found", 404);
  }
  const name = q.get("name") ?? key.split("/").pop() ?? "file";
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: { "content-length": String(size), "content-disposition": contentDisposition(name), "content-type": "application/octet-stream", "cache-control": "private, no-store" },
  });
}
