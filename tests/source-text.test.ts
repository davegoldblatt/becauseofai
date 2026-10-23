import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, findQuote, extractDoi, nctOf, decodeEntities } from "../scripts/lib/source-text.ts";
import { withOwned, stripOwned, appendHistory, setScalar, contentSha256, topLevelBlocks } from "../scripts/lib/yaml-edit.ts";

test("html to text drops chrome and keeps paragraphs and cells", () => {
  const t = htmlToText('<html><head><title>T</title><style>p{}</style><script>x()</script></head><body><nav>menu</nav><p>Hello &amp; <b>world</b>&nbsp;&#8211; ok</p><table><tr><td>2.9%</td><td>3.9%</td></tr></table></body></html>');
  assert.match(t, /Hello & world – ok/);
  assert.match(t, /2\.9%\t3\.9%/);
  assert.doesNotMatch(t, /menu|x\(\)/);
  assert.equal(decodeEntities("&lt;5&gt; &quot;a&quot; &#x2014;"), '<5> "a" —');
});

test("quotes match verbatim after normalising quotes, dashes and whitespace, and loosely on punctuation", () => {
  const text = "New vascular events occurred in 2·9% of patients,\n versus 3·9% in usual care (adjusted HR 0·74).";
  assert.deepEqual(findQuote(text, "events occurred in 2.9% of patients, versus 3.9%"), { found: true, exact: false });
  assert.deepEqual(findQuote("The hazard ratio was 0.74 (95% CI 0.58 to 0.93).", "hazard ratio was 0.74 (95% CI 0.58 to 0.93)"), { found: true, exact: true });
  assert.deepEqual(findQuote("The hazard ratio was 0.71.", "hazard ratio was 0.74"), { found: false, exact: false });
  assert.deepEqual(findQuote("abc", ""), { found: false, exact: false });
});

test("identifiers", () => {
  assert.equal(extractDoi("https://doi.org/10.1136/bmj-2025-085810"), "10.1136/bmj-2025-085810");
  assert.equal(extractDoi("https://www.nature.com/articles/s41591-025-04058-y"), null);
  assert.equal(nctOf("https://clinicaltrials.gov/study/NCT04524624"), "NCT04524624");
});

const RAW = `id: x
headline: >-
  Because of AI, something
  happened.
sources:
  - title: a
    url: https://example.org
    type: primary
history:
  - date: 2026-10-22
    note: "Added."
held:
  reason: ungrounded
  since: 2026-10-23
  detail: old
`;

test("owned blocks are replaced at the end and the rest of the file is byte-identical", () => {
  const out = withOwned(RAW, { receipts: [{ field: "headline", quote: "a: b", locator: "l", source: 0 }], held: undefined, verification: { drafter: { vendor: "anthropic", model: "m", date: "2026-10-23" }, verifier: { vendor: "openai", model: "n", date: "2026-10-23", verdict: "pass" }, record: "x/2026-10-23.json" } });
  assert.equal(stripOwned(out), stripOwned(RAW));
  assert.equal(contentSha256(out), contentSha256(RAW));
  assert.match(out, /^receipts:\n  - field: headline\n    quote: "a: b"/m);
  assert.match(out, /^verification:\n  drafter:/m);
  assert.doesNotMatch(out, /^held:/m);
  assert.deepEqual(topLevelBlocks(out).map((b) => b.key), ["id", "headline", "sources", "history", "receipts", "verification"]);
});

test("history lines append inside the history block; scalars are replaced in place", () => {
  const out = appendHistory(RAW, { date: "2026-10-24", note: "Corrected x per dispute #3." });
  assert.match(out, /note: "Added."\n  - date: 2026-10-24\n    note: "Corrected x per dispute #3."\nheld:/);
  const s = setScalar(out, ["held", "detail"], "new: detail");
  assert.equal(s.reflowed, false);
  assert.match(s.text, /detail: "new: detail"\n/);
  assert.match(s.text, /headline: >-\n  Because of AI, something\n  happened\./);
});
