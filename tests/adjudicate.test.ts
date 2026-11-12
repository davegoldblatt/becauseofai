// The gate's fixtures (DAV-376): six that must hold, one that must publish.
// DAV-469 adds the levels: findings that lower an entry to reasonable or
// speculative instead of holding it, each with a control that still holds.
// No model runs here; each case feeds the adjudicator what the code would have
// fetched and checked and what the verifier would have answered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adjudicate, isPressWire, type AdjudicationInput } from "../scripts/lib/adjudicate.ts";
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
    full_text: true, source_kind: "paper", source_findings: [{ source: 0, kind: "paper", full_text: true }],
    receipts: (e.receipts ?? []).map((r) => ({ field: r.field, status: "supported", note: "" })),
    grades: { evidence: "A", attribution: "bundled", window: "pre" },
    attribution_rationale: "Hospitals were randomized to the AI package or usual care.",
    achieved_dates: { from: "methods", conflicting: false, note: "" },
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
  assert.equal(a.confidence, "strict");
  assert.deepEqual(a.relaxed, []);
});

test("1. achieved dates taken from the abstract when the methods give different ones: held ungrounded", () => {
  const e = entry();
  const v = verdict(e, { achieved_dates: { from: "abstract", conflicting: true, note: "the methods section gives January 2021 to June 2023; the abstract says 2022" } });
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

test("3. a press release as the only primary source: speculative, never strict; no primary at all still holds", () => {
  const e = entry({ sources: [{ title: "Press release", url: "https://example.org/press", type: "primary" }] });
  const v = verdict(e, { source_kind: "press-release", source_findings: [{ source: 0, kind: "press-release", full_text: true }] });
  const a = adjudicate(input(e, { verifier: { ok: true, output: v } }));
  assert.equal(a.result, "published");
  assert.equal(a.confidence, "speculative");
  assert.match(a.relaxed!.join(" "), /press release/);
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

test("nothing fetched still holds; an abstract on a page is reasonable; a registry or Europe PMC read stays strict", () => {
  const e = entry();
  assert.equal(adjudicate(input(e, { sources: [unfetched()], verifier: null })).reason, "no-full-text");
  const v = verdict(e, { full_text: false, source_findings: [{ source: 0, kind: "paper", full_text: false }], summary: "Only the abstract was provided." });
  const page: SourceFetch = { ...fetched(), method: "html" };
  const a = adjudicate(input(e, { sources: [page], verifier: { ok: true, output: v } }));
  assert.equal(a.result, "published");
  assert.equal(a.confidence, "reasonable");
  // A registry record or a Europe PMC article is complete by construction: the verifier's doubt does not lower it.
  const b = adjudicate(input(e, { sources: [fetched()], verifier: { ok: true, output: v } }));
  assert.equal(b.confidence, "strict");
  // Text the reader itself kept only in part is never strict, whatever the verifier says.
  const c = adjudicate(input(e, { sources: [{ ...fetched(), partial: true }] }));
  assert.equal(c.confidence, "reasonable");
  // Control: an abstract whose receipt the verifier cannot support still holds.
  const bad = verdict(e, { full_text: false, source_findings: [{ source: 0, kind: "paper", full_text: false }], receipts: verdict(e).receipts.map((r) => (r.field === "reach" ? { ...r, status: "unsupported" as const, note: "not in the abstract" } : r)) });
  assert.equal(adjudicate(input(e, { sources: [page], verifier: { ok: true, output: bad } })).reason, "ungrounded");
});

test("grade split: both grades given publishes as speculative with the split recorded; a side that could not grade holds", () => {
  const e = entry();
  const v = verdict(e, { grades: { evidence: "A", attribution: "isolated", window: "pre" } });
  const a = adjudicate(input(e, { verifier: { ok: true, output: v } }));
  assert.equal(a.result, "published");
  assert.equal(a.confidence, "speculative");
  assert.deepEqual(a.splits, [{ grade: "attribution", drafter: "bundled", verifier: "isolated" }]);
  assert.match(a.relaxed![0], /disagreed on attribution: the drafter said bundled and the verifier said isolated\. The entry shows the drafter's grade, bundled; treat that grade as unsettled\./);
  // A verifier that cannot grade is a split too.
  const w = verdict(e, { grades: { evidence: null, attribution: "bundled", window: "pre" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: w } })).reason, "grade-split");
});

test("no comparison is speculative; not reaching people or no AI counterfactual holds; a not-yet entry is not tested", () => {
  const e = entry();
  const v = verdict(e, { tests: { reached_people: true, measured_against: false, ai_counterfactual: true, dated: true, note: "no comparison arm" } });
  const a = adjudicate(input(e, { verifier: { ok: true, output: v } }));
  assert.equal(a.result, "published");
  assert.equal(a.confidence, "speculative");
  const lab = verdict(e, { tests: { reached_people: false, measured_against: true, ai_counterfactual: true, dated: true, note: "a benchmark, no patients" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: lab } })).reason, "fails-test");
  const noAi = verdict(e, { tests: { reached_people: true, measured_against: false, ai_counterfactual: false, dated: true, note: "" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: noAi } })).reason, "fails-test");
  const ny = entry({ section: "not-yet", grades: { evidence: null, attribution: null, window: null }, what_would_change: "An outcome." });
  const w = verdict(ny, { grades: { evidence: null, attribution: null, window: null }, tests: { reached_people: false, measured_against: false, ai_counterfactual: false, dated: false, note: "not a result" } });
  assert.equal(adjudicate(input(ny, { verifier: { ok: true, output: w } })).result, "published");
  // A verifier that grades a watchlist entry disagrees that it is one.
  const graded = verdict(ny, { grades: { evidence: "A", attribution: "isolated", window: "pre" } });
  assert.equal(adjudicate(input(ny, { verifier: { ok: true, output: graded } })).reason, "grade-split");
});

test("a source the code cut short holds before any model is asked", () => {
  const e = entry();
  const cut: SourceFetch = { ...fetched(), truncated: true };
  const a = adjudicate(input(e, { sources: [cut], verifier: null }));
  assert.equal(a.reason, "no-full-text");
  assert.match(a.detail, /longer than the reader keeps/);
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
  const v = verdict(e, { achieved_dates: { from: "not-applicable", conflicting: false, note: "" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: v } })).reason, "ungrounded");
  const r = verdict(e, { achieved_dates: { from: "results", conflicting: false, note: "the screening span is given in Results" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: r } })).result, "published");
});

test("a drafter that could not grade and a verifier that could is a split", () => {
  const e = entry({ grades: { evidence: "A", attribution: "bundled", window: null }, notes: "verify: window" });
  const a = adjudicate(input(e));
  assert.equal(a.reason, "grade-split");
  assert.deepEqual(a.splits, [{ grade: "window", drafter: null, verifier: "pre" }]);
});

test("a receipt whose source could not be read is a reading failure", () => {
  const e = entry();
  const checks = allFound(e).map((c) => ({ ...c, found: false, exact: false, status: "unsupported" as const, note: "source 0 could not be read: HTTP 403" }));
  const a = adjudicate(input(e, { sources: [unfetched(0, "HTTP 403"), fetched(1)], quoteChecks: checks, verifier: null }));
  assert.equal(a.reason, "no-full-text");
  assert.match(a.detail, /HTTP 403/);
});

test("dates from the abstract are reasonable, from a press release speculative, and conflicting dates hold", () => {
  const e = entry();
  const abs = verdict(e, { achieved_dates: { from: "abstract", conflicting: false, note: "only the abstract gives the enrolment span" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: abs } })).confidence, "reasonable");
  const pr = verdict(e, { achieved_dates: { from: "press-release", conflicting: false, note: "" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: pr } })).confidence, "speculative");
  // Control: a stored verdict from before the levels has no conflicting field, so it is assumed and holds.
  const old = { ...verdict(e), achieved_dates: { from: "abstract", note: "" } } as unknown as Verdict;
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: old } })).reason, "ungrounded");
});

test("only the sources the receipts quote decide the level; the lowest level wins", () => {
  const two = entry({ sources: [{ title: "BMJ paper", url: "https://doi.org/10.1136/bmj-2025-085810", type: "primary" }, { title: "Press release", url: "https://example.org/press", type: "primary" }] });
  const findings = [{ source: 0, kind: "paper" as const, full_text: true }, { source: 1, kind: "press-release" as const, full_text: true }];
  // Every receipt quotes the paper: the release beside it does not lower the entry.
  const a = adjudicate(input(two, { sources: [fetched(0), { ...fetched(1), method: "html" }], verifier: { ok: true, output: verdict(two, { source_findings: findings }) } }));
  assert.equal(a.confidence, "strict");
  // One receipt quotes the release: speculative.
  const mixed = entry({ sources: two.sources, receipts: (two.receipts ?? []).map((r) => (r.field === "reach" ? { ...r, source: 1 } : r)) });
  const b = adjudicate(input(mixed, { sources: [fetched(0), { ...fetched(1), method: "html" }], verifier: { ok: true, output: verdict(mixed, { source_findings: findings }) } }));
  assert.equal(b.confidence, "speculative");
  // Abstract-only paper plus press-release dates: the lower, speculative, wins and both reasons are kept.
  const both = verdict(two, { source_findings: [{ source: 0, kind: "paper", full_text: false }, findings[1]], achieved_dates: { from: "press-release", conflicting: false, note: "" } });
  const c = adjudicate(input(two, { sources: [{ ...fetched(0), method: "html" }, { ...fetched(1), method: "html" }], verifier: { ok: true, output: both } }));
  assert.equal(c.confidence, "speculative");
  assert.equal(c.relaxed!.length, 2);
});

test("a lowered entry still holds when a side could not grade or on an unstated conflict", () => {
  const e = entry();
  const split = verdict(e, { full_text: false, source_findings: [{ source: 0, kind: "paper", full_text: false }], grades: { evidence: "B", attribution: "bundled", window: "pre" } });
  // (2026-11-11) A split with both grades given lowers further, to speculative; it no longer holds.
  assert.equal(adjudicate(input(e, { sources: [{ ...fetched(), method: "html" }], verifier: { ok: true, output: split } })).confidence, "speculative");
  const cannot = verdict(e, { full_text: false, source_findings: [{ source: 0, kind: "paper", full_text: false }], grades: { evidence: null, attribution: "bundled", window: "pre" } });
  assert.equal(adjudicate(input(e, { sources: [{ ...fetched(), method: "html" }], verifier: { ok: true, output: cannot } })).reason, "grade-split");
  const pr = verdict(e, { source_findings: [{ source: 0, kind: "press-release", full_text: true }], conflict: { in_source: true, stated_in_entry: false, note: "a company announcement" } });
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: pr } })).reason, "fails-test");
});

test("a split where the entry already shows the weaker claim publishes below strict and says so (2026-11-11)", () => {
  const e = entry(); // A · bundled · pre
  // Window: the entry says pre, the verifier read in.
  const w = adjudicate(input(e, { verifier: { ok: true, output: verdict(e, { grades: { evidence: "A", attribution: "bundled", window: "in" } }) } }));
  assert.equal(w.result, "published");
  assert.equal(w.confidence, "reasonable");
  assert.deepEqual(w.splits, [{ grade: "window", drafter: "pre", verifier: "in" }]);
  assert.match(w.relaxed![0], /disagreed on window: the drafter said pre and the verifier said in\. The entry shows the more cautious of the two, pre\./);
  // Evidence: the entry says B, the verifier read A.
  const b = entry({ grades: { evidence: "B", attribution: "bundled", window: "pre" } });
  const ev = adjudicate(input(b, { verifier: { ok: true, output: verdict(b, { grades: { evidence: "A", attribution: "bundled", window: "pre" } }) } }));
  assert.equal(ev.result, "published");
  assert.equal(ev.confidence, "reasonable");
  // It never raises a level that something else lowered further.
  const pr = adjudicate(input(b, { verifier: { ok: true, output: verdict(b, { source_findings: [{ source: 0, kind: "press-release", full_text: true }], grades: { evidence: "A", attribution: "bundled", window: "pre" } }) } }));
  assert.equal(pr.confidence, "speculative");
  assert.equal(pr.relaxed!.length, 2);

  // The other way round, the entry makes the stronger claim: speculative, not reasonable, and the reason says the grade is unsettled.
  const out = (ent: Entry, grades: Verdict["grades"]) => adjudicate(input(ent, { verifier: { ok: true, output: verdict(ent, { grades }) } }));
  const stronger = out(e, { evidence: "B", attribution: "bundled", window: "pre" });
  assert.equal(stronger.confidence, "speculative");
  assert.match(stronger.relaxed![0], /treat that grade as unsettled/);
  const inWin = entry({ grades: { evidence: "A", attribution: "bundled", window: "in" } });
  assert.equal(out(inWin, { evidence: "A", attribution: "bundled", window: "pre" }).confidence, "speculative");
  // in against ongoing, and attribution, have no order: speculative.
  assert.equal(out(inWin, { evidence: "A", attribution: "bundled", window: "ongoing" }).confidence, "speculative");
  assert.equal(out(e, { evidence: "A", attribution: "isolated", window: "pre" }).confidence, "speculative");
  // One cautious split next to one that is not: the lower level wins, and both are listed.
  const mixed = out(b, { evidence: "A", attribution: "isolated", window: "pre" });
  assert.equal(mixed.confidence, "speculative");
  assert.equal(mixed.splits!.length, 2);
  // A verifier that could not grade made no judgment: held, whatever else agrees.
  assert.equal(out(e, { evidence: "A", attribution: "bundled", window: null }).reason, "grade-split");
  assert.equal(out(b, { evidence: "A", attribution: "bundled", window: null }).reason, "grade-split");
  // And a cautious split does not rescue an unsupported receipt.
  const bad = verdict(e, { grades: { evidence: "A", attribution: "bundled", window: "in" } });
  bad.receipts[0] = { ...bad.receipts[0], status: "contradicted", note: "the table says 12" };
  assert.equal(adjudicate(input(e, { verifier: { ok: true, output: bad } })).reason, "ungrounded");
});

test("from an abstract as the reader prints it to a reasonable entry: the quote check is real, not injected", async () => {
  const { htmlToText, findQuote } = await import("../scripts/lib/source-text.ts");
  // Europe PMC's XML: a structured abstract whose section tags are escaped.
  const xml = "<result><title>AI package for stroke care</title><abstractText>&lt;h4&gt;Methods&lt;/h4&gt;21,603 patients from 77 hospitals enrolled between January 2021 and June 2023.&lt;h4&gt;Results&lt;/h4&gt;10 fewer events per 1,000 patients, a 26% relative reduction.</abstractText></result>";
  const text = htmlToText(xml);
  const e = entry();
  const checks = (quoteIn: (q: string) => string = (q) => q): QuoteCheck[] => (e.receipts ?? []).map((r) => {
    const f = findQuote(text, quoteIn(r.quote));
    return { field: r.field, source: r.source, quote: r.quote, found: f.found, exact: f.exact, status: f.found ? "supported" : "unsupported" };
  });
  const v = verdict(e, { full_text: false, source_findings: [{ source: 0, kind: "paper", full_text: false }], achieved_dates: { from: "abstract", conflicting: false, note: "" } });
  const a = adjudicate(input(e, { sources: [{ ...fetched(), method: "html" }], quoteChecks: checks(), verifier: { ok: true, output: v } }));
  assert.equal(a.result, "published");
  assert.equal(a.confidence, "reasonable");
  // Control: a number the abstract does not carry still holds as ungrounded.
  const wrong = adjudicate(input(e, { sources: [{ ...fetched(), method: "html" }], quoteChecks: checks((q) => q.replace("21,603", "31,603")), verifier: { ok: true, output: v } }));
  assert.equal(wrong.reason, "ungrounded");
});

test("an announcement caps the entry at speculative even when the verifier calls the page a report (DAV-475)", () => {
  const report = { source_kind: "operational-report" as const, source_findings: [{ source: 0, kind: "operational-report" as const, full_text: true }], grades: { evidence: "C" as const, attribution: "bundled" as const, window: "pre" as const } };
  const mk = (src: Record<string, unknown>) => entry({ grades: { evidence: "C", attribution: "bundled", window: "pre" }, sources: [{ title: "Newsroom", url: "https://example.org/newsroom/ai-results", type: "primary", ...src }, { title: "Press", url: "https://example.org/press", type: "secondary" }] as Entry["sources"] });
  // Control: the same verdict with no marker is strict, so the cap below is the marker's doing.
  const plain = mk({});
  assert.equal(adjudicate(input(plain, { verifier: { ok: true, output: verdict(plain, report) } })).confidence, "strict");
  // Marked by the drafter.
  const marked = mk({ announcement: true });
  const a = adjudicate(input(marked, { verifier: { ok: true, output: verdict(marked, report) } }));
  assert.equal(a.result, "published");
  assert.equal(a.confidence, "speculative");
  assert.match(a.relaxed!.join(" "), /organisation's own announcement/);
  // Not marked, but on a press-release wire.
  const wire = mk({ url: "https://www.prnewswire.com/news-releases/ai-results-302389211.html" });
  const w = adjudicate(input(wire, { verifier: { ok: true, output: verdict(wire, report) } }));
  assert.equal(w.confidence, "speculative");
  assert.match(w.relaxed!.join(" "), /wire service/);
  // A marked source nobody quotes from does not lower the entry: receipts decide which sources count.
  const unquoted = entry({ sources: [{ title: "Paper", url: "https://doi.org/10.1136/bmj-2025-085810", type: "primary" }, { title: "Release", url: "https://example.org/press", type: "primary", announcement: true }] as Entry["sources"] });
  assert.equal(adjudicate(input(unquoted, { verifier: { ok: true, output: verdict(unquoted) } })).confidence, "strict");
  assert.equal(isPressWire("https://www.businesswire.com/news/home/1/en/"), true);
  assert.equal(isPressWire("https://www.nejm.org/doi/full/10.1056/x"), false);
  assert.equal(isPressWire("not a url"), false);
});
