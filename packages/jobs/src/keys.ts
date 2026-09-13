import { randomBytes } from "node:crypto";

/** Storage keys are grouped by hour so the sweeper can delete whole prefixes: jobs/2026-09-13T11/<id>/... */
export function hourPrefix(date = new Date()): string {
  return `jobs/${date.toISOString().slice(0, 13)}`;
}

export function newJobId(): string {
  return randomBytes(12).toString("base64url");
}

/** Keep the extension, drop anything that can't be a safe key segment. Arabic names survive in the record, not the key. */
export function safeName(name: string, index: number): string {
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? "bin").toLowerCase();
  return `${index}.${ext}`;
}

export function inputKey(prefix: string, id: string, index: number, name: string): string {
  return `${prefix}/${id}/in/${safeName(name, index)}`;
}

export function outputKey(prefix: string, id: string, name: string): string {
  return `${prefix}/${id}/out/${name}`;
}

/** Prefix of every key that belongs to a job; derived from any of its keys. */
export function jobPrefix(anyKey: string): string {
  const parts = anyKey.split("/");
  return parts.slice(0, 3).join("/");
}

/** All hour prefixes older than `ttlSeconds` (bounded so a long-idle sweeper doesn't list forever). */
export function expiredHourPrefixes(ttlSeconds: number, now = new Date(), lookbackHours = 48): string[] {
  const out: string[] = [];
  const cutoff = now.getTime() - ttlSeconds * 1000;
  for (let h = 1; h <= lookbackHours; h++) {
    const d = new Date(now.getTime() - h * 3600 * 1000);
    // An hour bucket is fully expired once its END is before the cutoff.
    const bucketEnd = new Date(d.toISOString().slice(0, 13) + ":00:00Z").getTime() + 3600 * 1000;
    if (bucketEnd <= cutoff) out.push(hourPrefix(d));
  }
  return out;
}
