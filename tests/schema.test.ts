// The schema's state rules (DAV-376): cross-vendor is enforced in the data
// itself, receipts must cover every number before an entry publishes, and a
// failed verification must say why it is held.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EntrySchema, isPublished, heldInfo, requiredReceiptFields, missingReceipts } from "../src/schema.ts";

const base = () => ({
  id: "x", section: "because", rank: 1,
  headline: "Because of AI, 10 fewer patients per 1,000 had an event.", impact: "26% fewer events",
  summary: "s", domain: "medicine", ai_type: "classic-ml",
  grades: { evidence: "A", attribution: "isolated", window: "pre" },
  effect: { relative: "26% fewer", absolute: null },
  dates: { achieved_start: "2021-01", achieved_end: null, published: "2026-03-20", added: "2026-10-22", updated: "2026-10-22" },
  sources: [{ title: "paper", url: "https://doi.org/10.1/x", type: "primary" }, { title: "news", url: "https://example.org/n", type: "secondary" }],
  history: [{ date: "2026-10-22", note: "Added." }],
});
const pass = (drafter = "anthropic", verifier = "openai") => ({
  drafter: { vendor: drafter, model: "m1", date: "2026-10-23" },
  verifier: { vendor: verifier, model: "m2", date: "2026-10-23", verdict: "pass" },
  record: "x/2026-10-23.json",
});
const receiptsFor = (fields: string[]) => fields.map((field) => ({ field, quote: "ten words or fewer", locator: "Results", source: 0 }));

test("required receipt fields are the set fields that carry a digit", () => {
  const e = base();
  assert.deepEqual(requiredReceiptFields(e as any), ["headline", "impact", "effect.relative", "dates.achieved_start"]);
});

test("an entry the gate passed needs a receipt on every numeric field; an unverified one does not", () => {
  assert.equal(EntrySchema.safeParse({ ...base(), receipts: receiptsFor(["headline"]) }).success, true);
  const e = { ...base(), verification: pass(), receipts: receiptsFor(["headline", "impact", "effect.relative"]) };
  const r = EntrySchema.safeParse(e);
  assert.equal(r.success, false);
  assert.match(JSON.stringify(r.error?.issues), /no receipt for dates.achieved_start/);
  const ok = EntrySchema.safeParse({ ...e, receipts: receiptsFor(["headline", "impact", "effect.relative", "dates.achieved_start"]) });
  assert.equal(ok.success, true);
  assert.equal(isPublished(ok.data!), true);
});

test("the same vendor on both sides never publishes, whatever the file says", () => {
  const e = { ...base(), verification: pass("openai", "openai"), receipts: receiptsFor(["headline", "impact", "effect.relative", "dates.achieved_start"]) };
  const r = EntrySchema.safeParse(e);
  assert.equal(r.success, false);
  assert.match(JSON.stringify(r.error?.issues), /different vendors/);
});

test("a failed verification must carry a held block; a held entry is not published", () => {
  const fail = { ...pass(), verifier: { ...pass().verifier, verdict: "fail" } };
  assert.equal(EntrySchema.safeParse({ ...base(), verification: fail }).success, false);
  const held = EntrySchema.safeParse({ ...base(), verification: fail, held: { reason: "grade-split", since: "2026-10-23", detail: "attribution: drafter isolated, verifier bundled.", record: "x/2026-10-23.json" } });
  assert.equal(held.success, true);
  assert.equal(isPublished(held.data!), false);
  assert.equal(heldInfo(held.data!)?.reason, "grade-split");
});

test("an entry the gate has not run on stays published; only a held block or a failed verification holds it", () => {
  const r = EntrySchema.safeParse(base());
  assert.equal(r.success, true);
  assert.equal(isPublished(r.data!), true);
  assert.equal(heldInfo(r.data!), null);
  const fail = { ...pass(), verifier: { ...pass().verifier, verdict: "fail" } };
  const held = EntrySchema.safeParse({ ...base(), verification: fail, held: { reason: "ungrounded", since: "2026-10-23", detail: "d" } });
  assert.equal(isPublished(held.data!), false);
});

test("no primary source is held for that reason even with a verification", () => {
  const e = { ...base(), sources: [{ title: "news", url: "https://example.org/n", type: "secondary" }], verification: pass(), receipts: [] };
  const r = EntrySchema.safeParse(e);
  assert.equal(r.success, true);
  assert.equal(isPublished(r.data!), false);
  assert.equal(heldInfo(r.data!)?.reason, "no-primary-source");
});

test("a receipt must point at a primary source and stay within 25 words", () => {
  const bad = EntrySchema.safeParse({ ...base(), held: { reason: "ungrounded", since: "2026-10-23", detail: "d" }, receipts: [{ field: "headline", quote: "q", locator: "l", source: 1 }] });
  assert.equal(bad.success, false);
  assert.match(JSON.stringify(bad.error?.issues), /not a primary source/);
  const long = EntrySchema.safeParse({ ...base(), held: { reason: "ungrounded", since: "2026-10-23", detail: "d" }, receipts: [{ field: "headline", quote: Array(26).fill("w").join(" "), locator: "l", source: 0 }] });
  assert.equal(long.success, false);
  assert.match(JSON.stringify(long.error?.issues), /25 words/);
  assert.deepEqual(missingReceipts({ ...base(), receipts: receiptsFor(["headline"]) } as any), ["impact", "effect.relative", "dates.achieved_start"]);
});
