/**
 * File storage behind one interface:
 * - S3Storage: Cloudflare R2 (or MinIO) through the S3 API with presigned PUT/GET URLs, chosen when S3_BUCKET is set.
 * - LocalStorage: a folder on disk with HMAC-signed URLs served by the web app's /api/files route, for development and CI.
 * Keys look like jobs/2026-09-13T11/<jobId>/in/0.pdf so an hour prefix can be deleted as a unit.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { URL_TTL } from "./types";

export interface Storage {
  /** URL the browser PUTs the file to; the signature pins the exact size and type. */
  putUrl(key: string, size: number, type: string): Promise<string>;
  /** URL the browser downloads from, with a Content-Disposition carrying the real (possibly Arabic) name. */
  getUrl(key: string, filename: string): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  download(key: string, toPath: string): Promise<void>;
  upload(fromPath: string, key: string, type: string): Promise<{ size: number }>;
  deletePrefix(prefix: string): Promise<number>;
  /** Object keys under a prefix (used by the sweeper). */
  list(prefix: string): Promise<string[]>;
}

/** RFC 6266/5987 disposition so Arabic names survive every browser. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// ---------- S3 / R2 ----------
class S3Storage implements Storage {
  private client: import("@aws-sdk/client-s3").S3Client | null = null;
  constructor(private bucket: string) {}

  private async s3() {
    if (!this.client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.client = new S3Client({
        region: process.env.S3_REGION ?? "auto",
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
      });
    }
    return this.client;
  }

  async putUrl(key: string, size: number, type: string) {
    const [{ PutObjectCommand }, { getSignedUrl }] = await Promise.all([import("@aws-sdk/client-s3"), import("@aws-sdk/s3-request-presigner")]);
    return getSignedUrl(await this.s3(), new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentLength: size, ContentType: type }), { expiresIn: URL_TTL });
  }
  async getUrl(key: string, filename: string) {
    const [{ GetObjectCommand }, { getSignedUrl }] = await Promise.all([import("@aws-sdk/client-s3"), import("@aws-sdk/s3-request-presigner")]);
    return getSignedUrl(await this.s3(), new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: contentDisposition(filename) }), { expiresIn: URL_TTL });
  }
  async head(key: string) {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const r = await (await this.s3()).send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: r.ContentLength ?? 0 };
    } catch {
      return null;
    }
  }
  async download(key: string, toPath: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const r = await (await this.s3()).send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    await mkdir(dirname(toPath), { recursive: true });
    await pipeline(r.Body as Readable, createWriteStream(toPath));
  }
  async upload(fromPath: string, key: string, type: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { size } = await stat(fromPath);
    await (await this.s3()).send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(fromPath), ContentLength: size, ContentType: type }));
    return { size };
  }
  async list(prefix: string) {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const r = await (await this.s3()).send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
  async deletePrefix(prefix: string) {
    const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
    const keys = await this.list(prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      await (await this.s3()).send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
    }
    return keys.length;
  }
}

// ---------- Local folder ----------
export function localSign(key: string, method: "PUT" | "GET", exp: number, size?: number, type?: string): string {
  const secret = process.env.JOBS_SECRET ?? "dev-secret";
  return createHmac("sha256", secret).update([method, key, exp, size ?? "", type ?? ""].join("\n")).digest("base64url");
}
export function localVerify(sig: string, key: string, method: "PUT" | "GET", exp: number, size?: number, type?: string): boolean {
  if (exp * 1000 < Date.now()) return false;
  const expected = localSign(key, method, exp, size, type);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export class LocalStorage implements Storage {
  constructor(public root: string, private publicBase: string) {}

  path(key: string): string {
    const p = resolve(this.root, key);
    if (!p.startsWith(resolve(this.root) + sep)) throw new Error("bad key");
    return p;
  }
  async putUrl(key: string, size: number, type: string) {
    const exp = Math.floor(Date.now() / 1000) + URL_TTL;
    const q = new URLSearchParams({ exp: String(exp), size: String(size), type, sig: localSign(key, "PUT", exp, size, type) });
    return `${this.publicBase}/api/files/${key}?${q}`;
  }
  async getUrl(key: string, filename: string) {
    const exp = Math.floor(Date.now() / 1000) + URL_TTL;
    const q = new URLSearchParams({ exp: String(exp), name: filename, sig: localSign(key, "GET", exp) });
    return `${this.publicBase}/api/files/${key}?${q}`;
  }
  async head(key: string) {
    try {
      return { size: (await stat(this.path(key))).size };
    } catch {
      return null;
    }
  }
  async download(key: string, toPath: string) {
    await mkdir(dirname(toPath), { recursive: true });
    await pipeline(createReadStream(this.path(key)), createWriteStream(toPath));
  }
  async upload(fromPath: string, key: string, _type: string) {
    void _type;
    const dest = this.path(key);
    await mkdir(dirname(dest), { recursive: true });
    await pipeline(createReadStream(fromPath), createWriteStream(dest));
    return { size: (await stat(dest)).size };
  }
  async list(prefix: string) {
    const base = this.path(prefix);
    const out: string[] = [];
    const walk = async (dir: string) => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else out.push(p.slice(resolve(this.root).length + 1).split(sep).join("/"));
      }
    };
    await walk(base);
    return out;
  }
  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    await rm(this.path(prefix), { recursive: true, force: true });
    return keys.length;
  }
}

let instance: Storage | null = null;
/** S3 when S3_BUCKET is set, otherwise a local folder (JOBS_DIR, default ~/alarab-jobs) served through the web app. */
export function storage(): Storage {
  if (!instance) {
    if (process.env.S3_BUCKET) instance = new S3Storage(process.env.S3_BUCKET);
    else instance = new LocalStorage(process.env.JOBS_DIR ?? join(process.env.HOME ?? "/tmp", "alarab-jobs"), process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  }
  return instance;
}
