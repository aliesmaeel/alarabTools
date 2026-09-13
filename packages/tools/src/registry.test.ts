import { TOOLS, counts, GROUPS } from "./index.ts";

// Run with: pnpm --filter @alarab/tools test
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const ids = TOOLS.map((t) => t.id);
assert(new Set(ids).size === ids.length, "tool ids must be unique");
assert(counts.total === 48, `expected 48 tools, got ${counts.total}`);
assert(counts.browser === 31, `expected 31 browser tools, got ${counts.browser}`);
assert(counts.server === 17, `expected 17 server tools, got ${counts.server}`);

for (const t of TOOLS) {
  assert(/^[a-z0-9-]+$/.test(t.id), `${t.id}: slug must be lowercase Latin`);
  assert(GROUPS.includes(t.group), `${t.id}: unknown group`);
  assert(t.copy.ar.name && t.copy.en.name, `${t.id}: missing name`);
  assert(t.copy.ar.summary && t.copy.en.summary, `${t.id}: missing summary`);
  assert(t.accepts.length > 0, `${t.id}: accepts nothing`);
}

console.log(`registry ok: ${counts.total} tools, ${counts.browser} browser, ${counts.server} server`);
