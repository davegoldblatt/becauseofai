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

function record(over: Partial<VerificationRecord> = {}): VerificationRecord {
  return {
    version: 1, kind: "verification", entry: "x", date: "2026-10-23", as_of: "2026-10-22", entry_sha256: contentSha256(FILE),
    drafter: { vendor: "anthropic", model: "m1", date: "2026-10-23" }, sources: [], quote_checks: [],
    verifier: { vendor: "openai", model: "m2", via: "api", date: "2026-10-23", output: {}, error: null, tokens: null, duration_ms: 1 },
    adjudication: { result: "published", reason: null, detail: "ok" },
    ...over,
  };
}

test("a pass marker publishes only with a matching record", () => {
  const ok = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record() } });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.publishable.length, 1);
  const none = parseEntryFiles({ "x.yaml": FILE }, { records: {} });
  assert.equal(none.publishable.length, 0);
  assert.match(none.unbound.get("x")!, /not on disk/);
  const other = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ entry: "y" }) } });
  assert.match(other.unbound.get("x")!, /belongs to y/);
  const heldRec = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ adjudication: { result: "held", reason: "grade-split", detail: "d" } }) } });
  assert.match(heldRec.unbound.get("x")!, /did not publish/);
  const vendor = parseEntryFiles({ "x.yaml": FILE }, { records: { "x/2026-10-23.json": record({ verifier: { ...record().verifier!, vendor: "anthropic" } }) } });
  assert.match(vendor.unbound.get("x")!, /different verifier/);
});

test("changing a number or a receipt after verification holds the entry; a note does not", () => {
  const changed = FILE.replace("10 fewer patients per 1,000 had an event.", "12 fewer patients per 1,000 had an event.");
  const r = parseEntryFiles({ "x.yaml": changed }, { records: { "x/2026-10-23.json": record() } });
  assert.equal(r.publishable.length, 0);
  assert.match(r.unbound.get("x")!, /changed after/);
  const receipt = FILE.replace("quote: enrolled from January 2021", "quote: enrolled from January 2020");
  assert.equal(parseEntryFiles({ "x.yaml": receipt }, { records: { "x/2026-10-23.json": record() } }).publishable.length, 0);
  const noted = FILE.replace("history:", "notes: an editor's note\nhistory:");
  assert.equal(parseEntryFiles({ "x.yaml": noted }, { records: { "x/2026-10-23.json": record() } }).publishable.length, 1);
});
