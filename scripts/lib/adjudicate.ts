// The gate. Deterministic: given what the code fetched and checked and what
// the second vendor answered, decide published or held, and say why. No model
// decides this, and no rule here votes on a fact.
import { hasPrimarySource, missingReceipts, type Entry, type Vendor } from "../../src/schema.ts";
import type { Adjudication, QuoteCheck, SourceFetch, Split } from "./record.ts";
import type { Verdict } from "./verdict.ts";

export type VerifierOutcome = { ok: true; output: Verdict } | { ok: false; error: string } | null;

export type AdjudicationInput = {
  entry: Entry;
  drafterVendor: Vendor;
  verifierVendor: Vendor;
  sources: SourceFetch[];          // every primary source, fetched or not
  quoteChecks: QuoteCheck[];       // one per receipt, in order
  verifier: VerifierOutcome;       // null when the verifier was not run
};

const ACCEPTED_DATE_ORIGINS = new Set(["methods", "registry", "report-body", "not-applicable"]);
const NOT_PRIMARY = new Set(["press-release", "news"]);

const hold = (reason: Adjudication["reason"], detail: string, extra: Partial<Adjudication> = {}): Adjudication => ({ result: "held", reason, detail, ...extra });

export function adjudicate(input: AdjudicationInput): Adjudication {
  const { entry: e, sources, quoteChecks, verifier } = input;

  if (!hasPrimarySource(e)) return hold("no-primary-source", "No source is typed primary.");
  if (input.drafterVendor === input.verifierVendor) return hold("verification-unavailable", `Drafter and verifier are both ${input.drafterVendor}; the registry never publishes on one vendor.`);

  const fetched = sources.filter((s) => s.ok);
  if (!fetched.length) {
    const why = sources.map((s) => `source ${s.index}: ${s.reason ?? "not fetched"}`).join("; ");
    return hold("no-full-text", `No primary source could be read in full (${why}).`);
  }

  const missing = missingReceipts(e);
  if (missing.length) return hold("ungrounded", `No receipt for ${missing.join(", ")}.`);

  const notFound = quoteChecks.filter((c) => !c.found);
  if (notFound.length) {
    return hold("ungrounded", notFound.map((c) => `${c.field}: the quote is ${c.status === "stale" ? "no longer" : "not"} in source ${c.source}${c.note ? ` (${c.note})` : ""}`).join("; ") + ".");
  }

  if (!verifier) return hold("verification-unavailable", "The verifier did not run.");
  if (!verifier.ok) return hold("verification-unavailable", `The ${input.verifierVendor} verifier failed: ${verifier.error}`);
  const v = verifier.output;

  if (!v.full_text) return hold("no-full-text", `The verifier read only an abstract or landing page, not the full document${v.summary ? ` (${v.summary})` : ""}.`);
  if (NOT_PRIMARY.has(v.source_kind)) return hold("no-primary-source", `The primary source is a ${v.source_kind.replace("-", " ")}; press releases and news articles are leads, not evidence.`);

  const bad = v.receipts.map((r, i) => ({ r, i })).filter(({ r }) => r.status !== "supported");
  if (bad.length) {
    return hold("ungrounded", bad.map(({ r, i }) => `${r.field} (receipt ${i + 1}): ${r.status}${r.note ? `, ${r.note}` : ""}`).join("; ") + ".");
  }
  if (v.receipts.length !== (e.receipts ?? []).length) {
    return hold("verification-unavailable", `The verifier answered for ${v.receipts.length} receipts; the entry has ${(e.receipts ?? []).length}.`);
  }

  const hasDates = e.dates.achieved_start != null || e.dates.achieved_end != null;
  if (hasDates && !ACCEPTED_DATE_ORIGINS.has(v.achieved_dates.from)) {
    return hold("ungrounded", `The achieved dates come from ${v.achieved_dates.from === "not-found" ? "nowhere in the source" : `the ${v.achieved_dates.from.replace("-", " ")}`}, not the methods, the registry, or the report body${v.achieved_dates.note ? ` (${v.achieved_dates.note})` : ""}.`);
  }

  if (v.conflict.in_source && !v.conflict.stated_in_entry) {
    return hold("fails-test", `The source shows a conflict of interest the entry does not state${v.conflict.note ? `: ${v.conflict.note}` : "."}`);
  }

  if (e.section !== "not-yet") {
    const failed = (["reached_people", "measured_against", "ai_counterfactual", "dated"] as const).filter((k) => !v.tests[k]);
    if (failed.length) {
      const names: Record<string, string> = { reached_people: "reached people", measured_against: "measured against something", ai_counterfactual: "the AI did something that would not otherwise have happened", dated: "dated" };
      return hold("fails-test", `Failed: ${failed.map((k) => names[k]).join("; ")}${v.tests.note ? ` (${v.tests.note})` : ""}.`);
    }
    const splits: Split[] = [];
    for (const g of ["evidence", "attribution", "window"] as const) {
      const d = e.grades[g];
      if (d === null) continue; // an ungraded field (window with a verify: note) is not a split
      if (v.grades[g] !== d) splits.push({ grade: g, drafter: d, verifier: v.grades[g] });
    }
    if (splits.length) {
      return hold("grade-split", splits.map((s) => `${s.grade}: drafter ${s.drafter}, verifier ${s.verifier ?? "could not grade"}`).join("; ") + ".", { splits });
    }
  }

  return { result: "published", reason: null, detail: v.summary || "Every receipt supported; grades agree." };
}
