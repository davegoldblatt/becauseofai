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

const ACCEPTED_DATE_ORIGINS = new Set(["methods", "results", "registry", "report-body"]);
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
  if (missing.length) {
    // A number with no receipt because the source that would carry it could
    // not be read is a reading failure, not a grounding failure.
    const unread = sources.filter((s) => !s.ok);
    if (unread.length) return hold("no-full-text", `${unread.map((s) => `source ${s.index} could not be read in full (${s.reason})`).join("; ")}; no receipt for ${missing.join(", ")}.`);
    return hold("ungrounded", `No receipt for ${missing.join(", ")}.`);
  }

  const notFound = quoteChecks.filter((c) => !c.found);
  if (notFound.length) {
    // A receipt whose source could not be read is a reading failure, not a grounding failure.
    const unreadIdx = new Set(sources.filter((s) => !s.ok).map((s) => s.index));
    const unread = notFound.filter((c) => unreadIdx.has(c.source));
    if (unread.length) {
      return hold("no-full-text", [...new Set(unread.map((c) => c.source))].map((i) => { const s = sources.find((x) => x.index === i)!; return `source ${i} could not be read in full (${s.reason})`; }).join("; ") + `; receipts for ${[...new Set(unread.map((c) => c.field))].join(", ")} could not be checked.`);
    }
    return hold("ungrounded", notFound.map((c) => `${c.field}: the quote is ${c.status === "stale" ? "no longer" : "not"} in source ${c.source}${c.note ? ` (${c.note})` : ""}`).join("; ") + ".");
  }

  if (!verifier) return hold("verification-unavailable", "The verifier did not run.");
  if (!verifier.ok) return hold("verification-unavailable", `The ${input.verifierVendor} verifier failed: ${verifier.error}`);
  const v = verifier.output;

  // The verifier's full-text judgment matters for pages and PDFs, where the code
  // cannot tell an abstract from a paper, and for anything the code cut short.
  // A registry record from the API or a Europe PMC article, read whole, is
  // complete by construction.
  const judged = fetched.some((s) => !/^(clinicaltrials|europepmc)/.test(s.method) || s.truncated);
  if (!v.full_text && judged) return hold("no-full-text", `The verifier read only an abstract or landing page, not the full document${v.summary ? ` (${v.summary})` : ""}.`);
  if (NOT_PRIMARY.has(v.source_kind)) return hold("no-primary-source", `The primary source is a ${v.source_kind.replace("-", " ")}; press releases and news articles are leads, not evidence.`);

  // One verdict per receipt, in order, naming the same field: a verdict list
  // that is short, long, or shuffled is not an answer.
  const receipts = e.receipts ?? [];
  if (v.receipts.length !== receipts.length || v.receipts.some((r, i) => r.field !== receipts[i].field)) {
    return hold("verification-unavailable", `The verifier's receipt verdicts (${v.receipts.map((r) => r.field).join(", ") || "none"}) do not match the entry's receipts (${receipts.map((r) => r.field).join(", ") || "none"}).`);
  }
  const bad = v.receipts.map((r, i) => ({ r, i })).filter(({ r }) => r.status !== "supported");
  if (bad.length) {
    return hold("ungrounded", bad.map(({ r, i }) => `${r.field} (receipt ${i + 1}): ${r.status}${r.note ? `, ${r.note}` : ""}`).join("; ") + ".");
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
    // Every grade must match, null included: a drafter that could not grade
    // and a verifier that could is a disagreement the editor has to resolve.
    const splits: Split[] = [];
    for (const g of ["evidence", "attribution", "window"] as const) {
      if (v.grades[g] !== e.grades[g]) splits.push({ grade: g, drafter: e.grades[g], verifier: v.grades[g] });
    }
    if (splits.length) {
      return hold("grade-split", splits.map((s) => `${s.grade}: drafter ${s.drafter ?? "no grade"}, verifier ${s.verifier ?? "could not grade"}`).join("; ") + ".", { splits });
    }
  }

  return { result: "published", reason: null, detail: v.summary || "Every receipt supported; grades agree." };
}
