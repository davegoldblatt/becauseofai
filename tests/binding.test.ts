// A verification block in a file is a claim; the record is the evidence. The
// loader publishes only when the two bind to each other and to the content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEntryFiles } from "../src/lib/entries.ts";
import { contentSha256 } from "../src/lib/entry-text.ts";
import type { VerificationRecord } from "../scripts/lib/record.ts";

const FILE = `id: x
section: because
rank: 1
headline: Because of AI, 10 fewer patients per 1,000 had an event.
impact: fewer events
summary: s
domain: medicine
ai_type: classic-ml
grades:
  evidence: A
  attribution: isolated
  window: pre
dates:
  achieved_start: 2021-01
  achieved_end: null
  published: 2026-03-20
  added: 2026-10-22
  updated: 2026-10-22
sources:
  - title: paper
    url: https://doi.org/10.1/x
    type: primary
history:
  - date: 2026-10-22
    note: "Added."
receipts:
  - field: headline
    quote: 10 fewer patients per 1,000
    locator: Results
    source: 0
  - field: dates.achieved_start
    quote: enrolled from January 2021
    locator: Methods
    source: 0
verification:
  drafter:
    vendor: anthropic
    model: m1
    date: 2026-10-23
  verifier:
    vendor: openai
    model: m2
    date: 2026-10-23
    verdict: pass
  record: x/2026-10-23.json
`;

const VERDICT = {
  full_text: true, source_kind: "paper",
  receipts: [{ field: "headline", status: "supported", note: "" }, { field: "dates.achieved_start", status: "supported", note: "" }],
  grades: { evidence: "A", attribution: "isolated", window: "pre" },
  attribution_rationale: "arms differ only by the AI",
  achieved_dates: { from: "methods", note: "" },
  conflict: { in_source: false, stated_in_entry: false, note: "" },
  tests: { reached_people: true, measured_against: true, ai_counterfactual: true, dated: true, note: "" },
  summary: "ok",
};
function record(over: Partial<VerificationRecord> = {}): VerificationRecord {
  return {
    version: 1, kind: "verification", entry: "x", date: "2026-10-23", as_of: "2026-10-22", entry_sha256: contentSha256(FILE),
    drafter: { vendor: "anthropic", model: "m1", date: "2026-10-23" },
    sources: [{ index: 0, url: "https://doi.org/10.1/x", ok: true, method: "europepmc", fetched_at: "2026-10-23T00:00:00Z", sha256: "abc", chars: 50000, truncated: false }],
    quote_checks: [
      { field: "headline", source: 0, quote: "10 fewer patients per 1,000", found: true, exact: true, status: "supported" },
      { field: "dates.achieved_start", source: 0, quote: "enrolled from January 2021", found: true, exact: true, status: "supported" },
    ],
    verifier: { vendor: "openai", model: "m2", via: "api", date: "2026-10-23", output: VERDICT, error: null, tokens: null, duration_ms: 1 },
    adjudication: { result: "published", reason: null, detail: "ok" },
    ...over,
  };
}

test("a pass marker is shown as a verification only with a matching record; the entry stays published either way", () => {
  const ok = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record() } });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.publishable.length, 1);
  assert.equal(ok.unbound.size, 0);
  const none = parseEntryFiles({ "x.yaml": FILE }, { records: {} });
  assert.equal(none.publishable.length, 1);
  assert.match(none.unbound.get("x")!, /not on disk/);
  const other = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ entry: "y" }) } });
  assert.match(other.unbound.get("x")!, /belongs to y/);
  const heldRec = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ adjudication: { result: "held", reason: "grade-split", detail: "d" } }) } });
  assert.match(heldRec.unbound.get("x")!, /did not publish/);
  const vendor = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ verifier: { ...record().verifier!, vendor: "anthropic" } }) } });
  assert.match(vendor.unbound.get("x")!, /different verifier/);
  // A record that says "published" but whose own inputs do not re-derive it, or that skipped the receipts, binds nothing.
  const empty = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ sources: [], quote_checks: [], verifier: { ...record().verifier!, output: {} } }) } });
  assert.match(empty.unbound.get("x")!, /no complete verdict/);
  const skipped = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ quote_checks: record().quote_checks.slice(0, 1) }) } });
  assert.match(skipped.unbound.get("x")!, /did not check/);
  const contradicted = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ verifier: { ...record().verifier!, output: { ...VERDICT, receipts: [{ field: "headline", status: "contradicted", note: "the paper says 12" }, VERDICT.receipts[1]] } } }) } });
  assert.match(contradicted.unbound.get("x")!, /does not re-derive/);
});

test("round 3: a record binds to the entry's sources, receipts' source indices, and the drafter's model and date", () => {
  const otherUrl = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ sources: [{ ...record().sources[0], url: "https://elsewhere.org/p" }] }) } });
  assert.match(otherUrl.unbound.get("x")!, /not the entry's/);
  const otherIdx = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ quote_checks: record().quote_checks.map((c) => ({ ...c, source: 99 })) }) } });
  assert.match(otherIdx.unbound.get("x")!, /against its sources/);
  const otherModel = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ drafter: { vendor: "anthropic", model: "other", date: "2026-10-23" } }) } });
  assert.match(otherModel.unbound.get("x")!, /different drafter/);
  const malformed = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": { ...record(), sources: [{ ok: true, method: "clinicaltrials" }] } as unknown as VerificationRecord } });
  assert.match(malformed.unbound.get("x")!, /malformed/);
  const stamp = FILE.replace("verification:", "drafted:\n  vendor: anthropic\n  model: not-m1\n  date: 2026-10-23\nverification:");
  assert.match(parseEntryFiles({ "x.yaml": stamp }, { records: { "x/2026-10-23.json": record() } }).unbound.get("x")!, /drafter stamp/);
});

test("aliases are refused, so a value cannot change through an excluded field", () => {
  const aliased = FILE.replace("headline: Because of AI, 10 fewer patients per 1,000 had an event.", "notes: &c Because of AI, 10 fewer patients per 1,000 had an event.\nheadline: *c");
  const r = parseEntryFiles({ "x.yaml": aliased }, { records: { "x/2026-10-23.json": record() } });
  assert.equal(r.publishable.length, 0);
  assert.match(r.errors.map((p) => p.message).join("\n"), /anchors and aliases/);
});

test("changing a number or a receipt after verification drops the verification from view; a note does not", () => {
  const changed = FILE.replace("10 fewer patients per 1,000 had an event.", "12 fewer patients per 1,000 had an event.");
  const r = parseEntryFiles({ "x.yaml": changed }, { records: { "x/2026-10-23.json": record() } });
  assert.equal(r.publishable.length, 1);
  assert.match(r.unbound.get("x")!, /changed after/);
  const receipt = FILE.replace("quote: enrolled from January 2021", "quote: enrolled from January 2020");
  assert.match(parseEntryFiles({ "x.yaml": receipt }, { records: { "x/2026-10-23.json": record() } }).unbound.get("x")!, /changed after/);
  const noted = FILE.replace("history:", "notes: an editor's note\nhistory:");
  assert.equal(parseEntryFiles({ "x.yaml": noted }, { records: { "x/2026-10-23.json": record() } }).unbound.size, 0);
});
