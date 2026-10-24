// Print a primary source as text, with the same reader the gate uses (the
// ClinicalTrials.gov API, Europe PMC full text, HTML, PDF via pdftotext).
// The drafting model runs this instead of fetching a page itself, so what it
// reads is what the verifier will read.
//   node scripts/read-source.ts <url> [--max <chars>]
import { fetchSourceText, MIN_FULL_TEXT_CHARS } from "./lib/source-text.ts";

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//i.test(a));
const maxIdx = args.indexOf("--max");
const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 250_000;
if (!url || !Number.isFinite(max) || max <= 0) {
  console.error("usage: node scripts/read-source.ts <url> [--max <chars>]");
  process.exit(2);
}
const r = await fetchSourceText(url);
if (!r.ok) {
  console.log(`NOT READ ${url}\nmethod: ${r.method}\nreason: ${r.reason}`);
  process.exit(1);
}
const full = r.chars >= MIN_FULL_TEXT_CHARS && !r.truncated;
console.log(`READ ${r.url}\nfinal url: ${r.finalUrl}\nmethod: ${r.method}\nchars: ${r.chars}${r.truncated ? " (truncated by the reader)" : ""}\nfull text: ${full ? "likely" : "no: too short or cut; treat as an abstract or landing page"}\n---`);
console.log(r.text.length > max ? `${r.text.slice(0, max)}\n--- [cut at ${max} chars; rerun with --max for more]` : r.text);
