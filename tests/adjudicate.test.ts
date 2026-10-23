// The gate's fixtures (DAV-376): six that must hold, one that must publish.
// No model runs here; each case feeds the adjudicator what the code would have
// fetched and checked and what the verifier would have answered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adjudicate, type AdjudicationInput } from "../scripts/lib/adjudicate.ts";
import { VerdictSchema, type Verdict } from "../scripts/lib/verdict.ts";
import { DraftEntrySchema, type Entry } from "../src/schema.ts";
import type { QuoteCheck, SourceFetch } from "../scripts/lib/record.ts";

function entry(over: Partial<Entry> = {}): Entry {
  const base = {
    id: "clean-rct", section: "because", rank: 1,
    headline: "Because of AI, 10 fewer stroke patients per 1,000 had another vascular event within three months.",
    impact: "26% fewer vascular events", impact_number: "26%", impact_label: "fewer vascular events",
    summary: "A cluster-randomized trial.", caveat: null, domain: "medicine", ai_type: "classic-ml",
    grades: { evidence: "A", attribution: "bundled", window: "pre" },
    comparison: "AI-CDSS vs usual care", effect: { relative: "26% relative reduction", absolute: "10 fewer events per 1,000 patients" },
    reach: "21,603 patients, 77 hospitals",
    dates: { achieved_start: "2021-01", achieved_end: "2023-06", published: "2026-03-20", added: "2026-10-22", updated: "2026-10-22" },
    sources: [{ title: "BMJ paper", url: "https://doi.org/10.1136/bmj-2025-085810", type: "primary" }, { title: "Press release", url: "https://example.org/press", type: "secondary" }],
    conflicts: "Funded by the vendor; funders had no role.",
    history: [{ date: "2026-10-22", note: "Added." }],
    receipts: [
      { field: "headline", quote: "10 fewer events per 1,000 patients", locator: "Results", source: 0 },
      { field: "impact", quote: "26% relative reduction", locator: "Results", source: 0 },
      { field: "impact_number", quote: "26% relative reduction", locator: "Results", source: 0 },
      { field: "effect.relative", quote: "26% relative reduction", locator: "Results", source: 0 },
      { field: "effect.absolute", quote: "10 fewer events per 1,000 patients", locator: "Results, Table 2", source: 0 },
      { field: "reach", quote: "21,603 patients from 77 hospitals", locator: "Methods", source: 0 },
      { field: "dates.achieved_start", quote: "enrolled between January 2021 and June 2023", locator: "Methods", source: 0 },
      { field: "dates.achieved_end", quote: "enrolled between January 2021 and June 2023", locator: "Methods", source: 0 },
    ],
    ...over,
  };
  const r = DraftEntrySchema.safeParse(base);
  if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data as Entry;
}

const fetched = (index = 0, sha = "abc"): SourceFetch => ({ index, url: "https://doi.org/x", ok: true, method: "europepmc", fetched_at: "2026-10-23T00:00:00Z", sha256: sha, chars: 50000, truncated: false });
const unfetched = (index = 0, reason = "HTTP 403"): SourceFetch => ({ index, url: "https://doi.org/x", ok: false, method: "html", fetched_at: "2026-10-23T00:00:00Z", reason });
const allFound = (e: Entry): QuoteCheck[] => (e.receipts ?? []).map((r) => ({ field: r.field, source: r.source, quote: r.quote, found: true, exact: true, status: "supported" }));

function verdict(e: Entry, over: Partial<Verdict> = {}): Verdict {
  const v: Verdict = {
    full_text: true, source_kind: "paper",
    receipts: (e.receipts ?? []).map((r) => ({ field: r.field, status: "supported", note: "" })),
    grades: { evidence: "A", attribution: "bundled", window: "pre" },
    attribution_rationale: "Hospitals were randomized to the AI package or usual care.",
    achieved_dates: { from: "methods", note: "" },
    conflict: { in_source: true, stated_in_entry: true, note: "vendor funding, disclosed" },
    tests: { reached_people: true, measured_against: true, ai_counterfactual: true, dated: true, note: "" },
    summary: "Every number is in Table 2 and the methods.",
    ...over,
  };
  return VerdictSchema.parse(v);
}

function input(e: Entry, over: Partial<AdjudicationInput> = {}): AdjudicationInput {
  return { entry: e, drafterVendor: "anthropic", verifierVendor: "openai", sources: [fetched()], quoteChecks: allFound(e), verifier: { ok: true, output: verdict(e) }, ...over };
}

test("publishes a clean RCT with every receipt supported and matching grades", () => {
  const e = entry();
  const a = adjudicate(input(e));
  assert.equal(a.result, "published");
  assert.equal(a.reason, null);
});

test("1. achieved dates taken from the abstract when the methods give different ones: held ungrounded", () => {
  const e = entry();
  const v = verdict(e, { achieved_dates: { from: "abstract", note: "the methods section gives January 2021 to June 2023; the abstract says 2022" } });
  const a = adjudicate(input(e, { verifier: { ok: true, output: v } }));
  assert.equal(a.result, "held");
  assert.equal(a.reason, "ungrounded");
  assert.match(a.detail, /abstract/);
});

test("2. a number present in the press release but absent from the paper: held ungrounded", () => {
  const e = entry();
  // The code already fails to find the quote in the paper's text.
  const checks = allFound(e).map((c) => (c.field === "reach" ? { ...c, found: false, exact: false, status: "unsupported" as const, note: "quote not found in the source text" } : c));
  const a = adjudicate(input(e, { quoteChecks: checks, verifier: null }));
  assert.equal(a.result, "held");
  assert.equal(a.reason, "ungrounded");
  assert.match(a.detail, /reach/);
  // And when the quote exists but the verifier says it does not establish the value.
  const v = verdict(e, { receipts: verdict(e).receipts.map((r) => (r.field === "reach" ? { ...r, status: "unsupported" as const, note: "the paper gives 21,603 patients; 77 hospitals appears only in the press release" } : r)) });
  const b = adjudicate(input(e, { verifier: { ok: true, output: v } }));
  assert.equal(b.result, "held");
  assert.equal(b.reason, "ungrounded");
});

test("3. a press release listed as the only primary source: held no-primary-source", () => {
  const e = entry({ sources: [{ title: "Press release", url: "https://example.org/press", type: "primary" }] });
  const v = verdict(e, { source_kind: "press-release" });
  const a = adjudicate(input(e, { verifier: { ok: true, output: v } }));
  assert.equal(a.result, "held");
  assert.equal(a.reason, "no-primary-source");
  // No primary at all holds before anything is fetched.
  const f = entry({ sources: [{ title: "Press release", url: "https://example.org/press", type: "secondary" }], receipts: [] });
  assert.equal(adjudicate(input(f, { verifier: null })).reason, "no-primary-source");
});

test("4. a company dashboard with no conflict stated: held fails-test", () => {
  const e = entry({ conflicts: "none found" });
  const v = verdict(e, { source_kind: "operational-report", grades: { evidence: "C", attribution: "bundled", window: "pre" }, conflict: { in_source: true, stated_in_entry: false, note: "the data is the company's own safety hub" } });
  const a = adjudicate(input(e, { verifier: { ok: true, output: v } }));
  assert.equal(a.result, "held");
  assert.equal(a.reason, "fails-test");
  assert.match(a.detail, /conflict/);
});

test("5. a receipt goes stale when the source changed and the quote is gone: held ungrounded", () => {
  const e = entry();
  const checks = allFound(e).map((c) => (c.field === "effect.absolute" ? { ...c, found: false, exact: false, status: "stale" as const, note: "the source text changed since the receipt was written" } : c));
  const a = adjudicate(input(e, { sources: [fetched(0, "def")], quoteChecks: checks, verifier: null }));
  assert.equal(a.result, "held");
  assert.equal(a.reason, "ungrounded");
  assert.match(a.detail, /no longer/);
});

test("6. vendor B unavailable: held verification-unavailable, never published on one vendor", () => {
  const e = entry();
  const a = adjudicate(input(e, { verifier: { ok: false, error: "no OPENAI_API_KEY and no Codex login" } }));
  assert.equal(a.result, "held");
  assert.equal(a.reason, "verification-unavailable");
  const b = adjudicate(input(e, { verifier: null }));
  assert.equal(b.reason, "verification-unavailable");
  const c = adjudicate(input(e, { verifierVendor: "anthropic" }));
  assert.equal(c.reason, "verification-unavailable");
  assert.match(c.detail, /both anthropic/);
});

test("no full text: nothing fetched, or the verifier saw only an abstract on a page", () => {
  const e = entry();
  assert.equal(adjudicate(input(e, { sources: [unfetched()], verifier: null })).reason, "no-full-text");
  const v = verdict(e, { full_text: false, summary: "Only the abstract was provided." });
  const page: SourceFetch = { ...fetched(), method: "html" };
  assert.equal(adjudicate(input(e, { sources: [page], verifier: { ok: true, output: v } })).reason, "no-full-text");
  // A registry record or a Europe PMC article is complete by construction: the verifier's doubt does not hold it.
  assert.equal(adjudicate(input(e, { sources: [fetched()], verifier: { ok: true, output: v } })).result, "published");
});

test("grade split: any disagreement holds, with the split recorded", () => {
  const e = entry();
  const v = verdict(e, { grades: { evidence: "A", attribution: "isolated", window: "pre" } });
  const a = adjudicate(input(e, { verifier: { ok: true, output: v } }));
  assert.equal(a.reason, "grade-split");
  assert.deepEqual(a.splits, [{ grade: "attribution", drafter: "bundled", verifier: "isolated" }]);
  // A verifier that cannot grade is a split too.
  const w = verdict(e, { grades: { evidence: null, attribution: "bundled", window: "pre" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: w } })).reason, "grade-split");
});

test("a failed test holds; a not-yet entry is not tested or grade-compared", () => {
  const e = entry();
  const v = verdict(e, { tests: { reached_people: true, measured_against: false, ai_counterfactual: true, dated: true, note: "no comparison arm" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: v } })).reason, "fails-test");
  const ny = entry({ section: "not-yet", grades: { evidence: null, attribution: null, window: null }, what_would_change: "An outcome." });
  const w = verdict(ny, { grades: { evidence: null, attribution: null, window: null }, tests: { reached_people: false, measured_against: false, ai_counterfactual: false, dated: false, note: "not a result" } });
  assert.equal(adjudicate(input(ny, { verifier: { ok: true, output: w } })).result, "published");
});

test("missing receipt coverage holds before the model is called", () => {
  const e = entry({ receipts: (entry().receipts ?? []).filter((r) => r.field !== "reach") });
  const a = adjudicate(input(e, { quoteChecks: allFound(e), verifier: null }));
  assert.equal(a.reason, "ungrounded");
  assert.match(a.detail, /No receipt for reach/);
  // When a primary source could not be read, the missing receipt is a reading failure.
  const two = entry({ sources: [...entry().sources, { title: "Registry", url: "https://clinicaltrials.gov/study/NCT00000000", type: "primary" }], receipts: (entry().receipts ?? []).filter((r) => r.field !== "reach") });
  const b = adjudicate(input(two, { sources: [unfetched(0, "only 230 characters"), fetched(2)], quoteChecks: allFound(two), verifier: null }));
  assert.equal(b.reason, "no-full-text");
  assert.match(b.detail, /source 0 could not be read/);
  assert.match(b.detail, /no receipt for reach/);
});

test("the verifier answering for the wrong number of receipts is unavailable, not a pass", () => {
  const e = entry();
  const v = verdict(e, { receipts: verdict(e).receipts.slice(0, 3) });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: v } })).reason, "verification-unavailable");
});

test("receipt verdicts must name the entry's receipts, in order", () => {
  const e = entry();
  const shuffled = verdict(e, { receipts: [...verdict(e).receipts].reverse() });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: shuffled } })).reason, "verification-unavailable");
  const padded = verdict(e, { receipts: verdict(e).receipts.map((r) => ({ ...r, field: "headline" as const })) });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: padded } })).reason, "verification-unavailable");
});

test("not-applicable date provenance counts only when the entry has no achieved dates", () => {
  const e = entry();
  const v = verdict(e, { achieved_dates: { from: "not-applicable", note: "" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: v } })).reason, "ungrounded");
  const r = verdict(e, { achieved_dates: { from: "results", note: "the screening span is given in Results" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: r } })).result, "published");
});

test("a drafter that could not grade and a verifier that could is a split; a cut source is judged for full text", () => {
  const e = entry({ grades: { evidence: "A", attribution: "bundled", window: null }, notes: "verify: window" });
  const a = adjudicate(input(e));
  assert.equal(a.reason, "grade-split");
  assert.deepEqual(a.splits, [{ grade: "window", drafter: null, verifier: "pre" }]);
  const cut: SourceFetch = { ...fetched(), truncated: true };
  const v = verdict(entry(), { full_text: false, summary: "cut before the results" });
  assert.equal(adjudicate(input(entry(), { sources: [cut], verifier: { ok: true, output: v } })).reason, "no-full-text");
});

test("a receipt whose source could not be read is a reading failure", () => {
  const e = entry();
  const checks = allFound(e).map((c) => ({ ...c, found: false, exact: false, status: "unsupported" as const, note: "source 0 could not be read: HTTP 403" }));
  const a = adjudicate(input(e, { sources: [unfetched(0, "HTTP 403"), fetched(1)], quoteChecks: checks, verifier: null }));
  assert.equal(a.reason, "no-full-text");
  assert.match(a.detail, /HTTP 403/);
});
