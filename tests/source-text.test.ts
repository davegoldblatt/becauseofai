import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, findQuote, extractDoi, nctOf, pmcidOf, decodeEntities, normalizeForMatch } from "../scripts/lib/source-text.ts";
import { withOwned, stripOwned, appendHistory, appendSource, setScalar, contentSha256, readOwned, assertEntry } from "../scripts/lib/yaml-edit.ts";
import { topBlocks } from "../src/lib/entry-text.ts";

test("html to text drops chrome and keeps paragraphs and cells", () => {
  const t = htmlToText('<html><head><title>T</title><style>p{}</style><script>x()</script></head><body><nav>menu</nav><p>Hello &amp; <b>world</b>&nbsp;&#8211; ok</p><table><tr><td>2.9%</td><td>3.9%</td></tr></table></body></html>');
  assert.match(t, /Hello & world – ok/);
  assert.match(t, /2\.9%\t3\.9%/);
  assert.doesNotMatch(t, /menu|x\(\)/);
  assert.equal(decodeEntities("&lt;5&gt; &quot;a&quot; &#x2014;"), '<5> "a" —');
});

test("quotes match after typographic normalisation, loosely on punctuation, never on a changed number", () => {
  const text = "New vascular events occurred in 2·9% of patients,\n versus 3·9% in usual care (adjusted HR 0·74).";
  assert.deepEqual(findQuote(text, "events occurred in 2.9% of patients, versus 3.9%"), { found: true, exact: true });
  assert.deepEqual(findQuote(text, "events occurred in 2.9% of patients versus 3.9%"), { found: true, exact: false });
  assert.deepEqual(findQuote("The hazard ratio was 0.74 (95% CI 0.58 to 0.93).", "hazard ratio was 0.74 (95% CI 0.58 to 0.93)"), { found: true, exact: true });
  assert.deepEqual(findQuote("21 603 patients from 77 hospitals", "21,603 patients from 77 hospitals"), { found: true, exact: true });
  assert.deepEqual(findQuote("The hazard ratio was 0.71.", "hazard ratio was 0.74"), { found: false, exact: false });
  // Numeric mutations a punctuation-blind comparison would accept.
  assert.equal(findQuote("The rate was -10 percent overall.", "10 percent").found, false);
  assert.equal(findQuote("The rate was 1.0 percent overall.", "10 percent").found, false);
  assert.equal(findQuote("a 210 percent rise", "10 percent").found, false);
  assert.equal(findQuote("rate 3.95% in arm", "3.9%").found, false);
  assert.equal(findQuote("rate 3.9% in arm", "3.9%").found, true);
  assert.equal(findQuote("rose by 10 percent, not 11", "rose by 10 percent").found, true);
  assert.deepEqual(findQuote("abc", ""), { found: false, exact: false });
  assert.equal(normalizeForMatch("2·9% of 21 603"), "2.9% of 21603");
});

test("identifiers", () => {
  assert.equal(extractDoi("https://doi.org/10.1136/bmj-2025-085810"), "10.1136/bmj-2025-085810");
  assert.equal(extractDoi("https://www.nature.com/articles/s41591-025-04058-y"), null);
  assert.equal(nctOf("https://clinicaltrials.gov/study/NCT04524624"), "NCT04524624");
  assert.equal(pmcidOf("https://pmc.ncbi.nlm.nih.gov/articles/PMC12768499/"), "PMC12768499");
});

// A real-shaped entry with the awkward cases: a quoted key, a comment, a
// keep-style scalar, and a document-end marker.
const RAW = `id: x
section: because
rank: 1
headline: >-
  Because of AI, 10 fewer patients
  per 1,000 had an event.
impact: 26% fewer events
summary: s
domain: medicine
ai_type: classic-ml
grades:
  evidence: A
  attribution: isolated
  window: pre
# a comment the editor left
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
held:
  reason: ungrounded
  since: 2026-10-23
  detail: old
"what_would_change": keep me
notes: |+
  two trailing newlines

...
`;

test("owned blocks are replaced at the end of the mapping and every other byte survives", () => {
  const out = withOwned(RAW, { receipts: [{ field: "headline", quote: "a: b", locator: "l", source: 0 }], held: undefined, verification: { drafter: { vendor: "anthropic", model: "m", date: "2026-10-23" }, verifier: { vendor: "openai", model: "n", date: "2026-10-23", verdict: "pass" }, record: "x/2026-10-23.json" } });
  const editorBytes = RAW.replace(/held:\n  reason: ungrounded\n  since: 2026-10-23\n  detail: old\n/, "");
  assert.equal(stripOwned(out), editorBytes);
  assert.match(out, /^"what_would_change": keep me\nnotes: \|\+\n  two trailing newlines\n\nreceipts:\n  - field: headline\n    quote: "a: b"/m);
  assert.match(out, /^verification:\n  drafter:/m);
  assert.doesNotMatch(out, /^held:/m);
  assert.ok(out.endsWith("record: x/2026-10-23.json\n...\n"));
  assert.deepEqual(topBlocks(out).blocks.map((b) => b.key), ["id", "section", "rank", "headline", "impact", "summary", "domain", "ai_type", "grades", "dates", "sources", "history", "what_would_change", "notes", "receipts", "verification"]);
  assert.deepEqual(Object.keys(readOwned(out)), ["receipts", "verification"]);
});

test("the content hash covers the receipts and ignores notes and history", () => {
  const a = withOwned(RAW, { receipts: [{ field: "headline", quote: "q1", locator: "l", source: 0 }] });
  const b = withOwned(RAW, { receipts: [{ field: "headline", quote: "q2", locator: "l", source: 0 }] });
  assert.notEqual(contentSha256(a), contentSha256(b));
  const c = appendHistory(a, { date: "2026-10-24", note: "Verified against dispute #3: not upheld." });
  assert.equal(contentSha256(a), contentSha256(c));
  assert.equal(contentSha256(a), contentSha256(withOwned(a, { held: { reason: "ungrounded", since: "2026-10-23", detail: "d" } })));
});

test("history lines append inside the history block with its indentation; a folded scalar is replaced whole", () => {
  const out = appendHistory(RAW, { date: "2026-10-24", note: "Corrected x per dispute #3." });
  assert.match(out, /note: "Added."\n  - date: 2026-10-24\n    note: "Corrected x per dispute #3."\nheld:/);
  const s = setScalar(out, ["headline"], "Because of AI, nine fewer: patients.");
  assert.equal(s.reflowed, false);
  assert.match(s.text, /^headline: "Because of AI, nine fewer: patients."\nimpact: 26% fewer events\n/m);
  const g = setScalar(s.text, ["grades", "evidence"], "B");
  assert.match(g.text, /evidence: B\n  attribution: isolated/);
  const src = appendSource(g.text, { title: "Reader", url: "https://b", type: "primary" });
  assert.equal(src.index, 1);
  assert.match(src.text, /    type: primary\n  - title: Reader\n    url: https:\/\/b\n    type: primary\nhistory:/);
  // An indentless sequence keeps its own layout.
  const flat = RAW.replace(/history:\n  - date: 2026-10-22\n    note: "Added."/, 'history:\n- date: 2026-10-22\n  note: "Added."');
  const f = appendHistory(flat, { date: "2026-10-24", note: "Updated." });
  assert.match(f, /note: "Added."\n- date: 2026-10-24\n  note: Updated.\nheld:/);
});

test("an edit that breaks the entry is refused before it is written", () => {
  assert.throws(() => setScalar(RAW, ["section"], "bogus"), /fails the schema/);
  assert.throws(() => assertEntry("id: [", "x"), /not valid YAML/);
  assert.throws(() => withOwned(RAW, { receipts: [{ field: "headline", quote: Array(30).fill("w").join(" "), locator: "l", source: 0 }] }) && assertEntry(withOwned(RAW, { receipts: [{ field: "headline", quote: Array(30).fill("w").join(" "), locator: "l", source: 0 }] })), /25 words/);
});
