// The gate. Deterministic: given what the code fetched and checked and what
// the second vendor answered, decide published or held, and say why. No model
// decides this, and no rule here votes on a fact.
import { CONFIDENCE, hasPrimarySource, missingReceipts, type Confidence, type Entry, type Vendor } from "../../src/schema.ts";
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
  // A source the code had to cut short was not read in full, whatever a model says about it.
  const cut = fetched.filter((s) => s.truncated);
  if (cut.length) return hold("no-full-text", cut.map((s) => `source ${s.index} is longer than the reader keeps (${s.chars} characters kept)`).join("; ") + ".");

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

  // How sure (DAV-469). Findings that used to hold the entry now lower its
  // level instead; every hold below still holds at every level, and the entry
  // publishes only after all of them have run.
  let level: Confidence = "strict";
  const relaxed: string[] = [];
  const lower = (to: Confidence, why: string) => { if (CONFIDENCE.indexOf(to) > CONFIDENCE.indexOf(level)) level = to; relaxed.push(why); };

  // The sources the receipts quote decide completeness and kind; with no
  // receipts, every source read. A registry record from the API or a Europe
  // PMC article is complete by construction unless the reader kept only part.
  const quoted = new Set((e.receipts ?? []).map((r) => r.source));
  const considered = fetched.filter((s) => !quoted.size || quoted.has(s.index));
  for (const s of considered) {
    const f = v.source_findings?.find((x) => x.source === s.index);
    const kind = f?.kind ?? v.source_kind;
    const fullByVerifier = f ? f.full_text : v.full_text;
    const complete = !s.partial && (/^(clinicaltrials|europepmc)/.test(s.method) || fullByVerifier);
    if (NOT_PRIMARY.has(kind)) lower("speculative", `Source ${s.index} is a ${kind.replace("-", " ")}, not a study, a registry record, or an official report.`);
    else if (!complete) lower("reasonable", `Source ${s.index} could be read only in part (an abstract or a summary), not the full document.`);
  }

  const hasDates = e.dates.achieved_start != null || e.dates.achieved_end != null;
  if (hasDates) {
    const from = v.achieved_dates.from;
    // A record from before the levels has no conflicting field: assume the worst.
    const conflicting = v.achieved_dates.conflicting ?? true;
    if (from === "not-found" || from === "not-applicable") {
      return hold("ungrounded", `The achieved dates come from nowhere in the source${v.achieved_dates.note ? ` (${v.achieved_dates.note})` : ""}.`);
    }
    if (!ACCEPTED_DATE_ORIGINS.has(from)) {
      if (conflicting) return hold("ungrounded", `The achieved dates come from the ${from.replace("-", " ")}, and another part of the text gives different dates${v.achieved_dates.note ? ` (${v.achieved_dates.note})` : ""}.`);
      if (from === "abstract") lower("reasonable", "The achieved dates come from the abstract; the methods were not available.");
      else lower("speculative", `The achieved dates come from the ${from.replace("-", " ")}.`);
    }
  }

  if (v.conflict.in_source && !v.conflict.stated_in_entry) {
    return hold("fails-test", `The source shows a conflict of interest the entry does not state${v.conflict.note ? `: ${v.conflict.note}` : "."}`);
  }

  // Watchlist entries are not tested (they have not demonstrated a benefit yet).
  // Failing "reached people" or "the AI did something that would not otherwise
  // have happened" holds at every level; no comparison or no date makes the
  // entry speculative.
  if (e.section !== "not-yet") {
    const names: Record<string, string> = { reached_people: "reached people", measured_against: "measured against something", ai_counterfactual: "the AI did something that would not otherwise have happened", dated: "dated" };
    const hard = (["reached_people", "ai_counterfactual"] as const).filter((k) => !v.tests[k]);
    if (hard.length) return hold("fails-test", `Failed: ${hard.map((k) => names[k]).join("; ")}${v.tests.note ? ` (${v.tests.note})` : ""}.`);
    const soft = (["measured_against", "dated"] as const).filter((k) => !v.tests[k]);
    if (soft.length) lower("speculative", `Not ${soft.map((k) => names[k]).join(" or ")} yet${v.tests.note ? ` (${v.tests.note})` : ""}.`);
  }
  // Every grade must match in every section, null included: a drafter that
  // could not grade and a verifier that could is a disagreement, and a verifier
  // that grades a watchlist entry says it is not a watchlist entry.
  const splits: Split[] = [];
  for (const g of ["evidence", "attribution", "window"] as const) {
    if (v.grades[g] !== e.grades[g]) splits.push({ grade: g, drafter: e.grades[g], verifier: v.grades[g] });
  }
  if (splits.length) {
    return hold("grade-split", splits.map((s) => `${s.grade}: drafter ${s.drafter ?? "no grade"}, verifier ${s.verifier ?? "could not grade"}`).join("; ") + ".", { splits });
  }

  return { result: "published", reason: null, detail: v.summary || "Every receipt supported; grades agree.", confidence: level, relaxed };
}
