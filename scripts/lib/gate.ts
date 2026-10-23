// One entry through the gate: fetch (code), check quotes (code), ask the second
// vendor (one call), adjudicate (code), write the record and the entry's blocks.
// verify.ts runs this over a set of entries; dispute.ts runs it once after an
// amendment.
import { VerdictSchema, jsonSchema, verifierSystem, verifierUser, entryForModel } from "./verdict.ts";
import { callStructured } from "./vendors.ts";
import { adjudicate, type VerifierOutcome } from "./adjudicate.ts";
import { readDraft, fetchPrimaries, sourcesForPrompt, checkQuotes, latestRecord, writeRecord, writeOwned, asOf, fmtTokens, type Role } from "./pipeline.ts";
import type { Adjudication, VerificationRecord, VendorRunRecord } from "./record.ts";

export type GateOptions = {
  drafter: Role;            // who the caller says drafted; the file's own `drafted` stamp wins and a conflict refuses the run
  verifier: Role;
  date: string;
  dryRun: boolean;
  force: boolean;
  resolvesDispute?: number; // set by dispute.ts: the only caller allowed to lift a `disputed` hold
  log?: (s: string) => void;
};
export type GateResult = { id: string; adjudication: Adjudication; skipped: boolean; record: string | null };

const VERDICT_SCHEMA = jsonSchema(VerdictSchema);

export async function runGate(id: string, o: GateOptions): Promise<GateResult> {
  const log = o.log ?? console.log;
  const d = readDraft(id);
  const e = d.entry;
  const previous = latestRecord(e);
  const changed = !previous || previous.entry_sha256 !== d.contentSha;
  // The drafter of record. A stamp on the file names the vendor, and the
  // vendor can never be relabelled by a flag: a conflict refuses the run. The
  // stamp is kept while it was made for this content (its content hash, or a
  // previous record with the same hash); otherwise the content was re-drafted
  // and the run's own drafter is stamped.
  const stamped = e.drafted ?? e.verification?.drafter ?? null;
  if (stamped && stamped.vendor !== o.drafter.vendor) throw new Error(`${id}: the file says ${stamped.vendor} drafted it; the run claims ${o.drafter.vendor}`);
  const stampHolds = !!stamped && ((e.drafted?.content ? e.drafted.content === d.contentSha : false) || (!!previous && previous.entry_sha256 === d.contentSha));
  const drafter: Role & { date: string } = stampHolds ? { vendor: stamped!.vendor, model: stamped!.model, date: stamped!.date } : { vendor: o.drafter.vendor, model: o.drafter.model, date: o.date };
  if (drafter.vendor === o.verifier.vendor) throw new Error(`${id}: drafter and verifier are both ${drafter.vendor}; refusing`);
  const unchanged = !changed && e.verification?.verifier.verdict === "pass" && !e.held;
  if (unchanged && !o.force) {
    log("  unchanged since its passing verification; skipped (--force to re-verify)");
    return { id, adjudication: previous.adjudication, skipped: true, record: e.verification!.record };
  }

  const fetched = await fetchPrimaries(e, log);
  const quoteChecks = checkQuotes(e, fetched, previous);
  for (const c of quoteChecks) if (!c.found) log(`  quote NOT FOUND for ${c.field} in source ${c.source}: ${c.note}`);

  const base = { entry: e, drafterVendor: drafter.vendor, verifierVendor: o.verifier.vendor, sources: fetched.fetches, quoteChecks };
  // The code's own holds come first; the model is not called for an entry the code already holds.
  const pre = adjudicate({ ...base, verifier: null });
  let outcome: VerifierOutcome = null;
  let run: VendorRunRecord | null = null;
  if (pre.reason === "verification-unavailable") {
    const user = verifierUser({ asOf, entryId: id, entryYaml: entryForModel(e), quoteChecks, sources: sourcesForPrompt(fetched) });
    const r = await callStructured(o.verifier.vendor, { system: verifierSystem(asOf), user, schema: VERDICT_SCHEMA, schemaName: "verdict", validate: VerdictSchema, model: o.verifier.model, effort: o.verifier.effort });
    run = { vendor: o.verifier.vendor, model: r.model, via: r.via, date: o.date, output: r.ok ? r.output : null, error: r.ok ? null : r.error, tokens: r.ok ? r.tokens : null, duration_ms: r.durationMs };
    outcome = r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    log(`  verifier ${o.verifier.vendor} ${r.ok ? "answered" : "FAILED: " + r.error} · ${r.ok ? fmtTokens(r.tokens) : ""} · ${Math.round(r.durationMs / 1000)} s`);
    if (r.ok) log(`  verifier grades ${r.output.grades.evidence ?? "-"} · ${r.output.grades.attribution ?? "-"} · ${r.output.grades.window ?? "-"}; full text ${r.output.full_text}; ${r.output.source_kind}; receipts ${r.output.receipts.map((x) => x.status[0]).join("")}`);
  }
  let final = adjudicate({ ...base, verifier: outcome });
  // An unchanged, previously published entry is not un-published by a vendor outage.
  if (final.reason === "verification-unavailable" && unchanged) {
    log("  verifier unavailable; previous verification stands");
    return { id, adjudication: previous!.adjudication, skipped: true, record: e.verification!.record };
  }
  // An open dispute is lifted only by the dispute handler resolving it, and
  // only when no other issue is still open on the entry. Whatever this run
  // found is in the record; the entry stays held as disputed until then.
  const openIssues = e.held?.reason === "disputed" ? (e.held.issues ?? []).filter((n) => n !== o.resolvesDispute) : [];
  const openDispute = e.held?.reason === "disputed" && (openIssues.length > 0 || (!e.held.issues && !o.resolvesDispute));
  if (openDispute) {
    log(`  dispute${openIssues.length > 1 ? "s" : ""} ${openIssues.map((n) => `#${n}`).join(", ") || "(unnumbered)"} still open; this run's outcome (${final.result}${final.reason ? ` ${final.reason}` : ""}) is recorded and the hold stays`);
    final = { result: "held", reason: "disputed", detail: `${e.held!.detail} Latest gate run: ${final.result}${final.reason ? ` (${final.reason})` : ""}.`.slice(0, 1900) };
  }
  // The record keeps the whole explanation; the entry's own summary is bounded.
  final = { ...final, detail: final.detail.length > 1900 ? final.detail.slice(0, 1897) + "..." : final.detail };
  log(`  => ${final.result.toUpperCase()}${final.reason ? ` (${final.reason})` : ""}: ${final.detail}`);
  if (o.dryRun) return { id, adjudication: final, skipped: false, record: null };

  const record: VerificationRecord = {
    version: 1, kind: "verification", entry: id, date: o.date, as_of: asOf, entry_sha256: d.contentSha,
    drafter: { vendor: drafter.vendor, model: drafter.model, date: drafter.date },
    sources: fetched.fetches, quote_checks: quoteChecks, verifier: run, adjudication: openDispute ? adjudicate({ ...base, verifier: outcome }) : final,
  };
  const rel = writeRecord(record);
  const verification = run && run.error === null
    ? { drafter: record.drafter!, verifier: { vendor: run.vendor, model: run.model, date: o.date, verdict: final.result === "published" ? "pass" : "fail" }, record: rel }
    : undefined;
  const since = e.held && e.held.reason === final.reason ? e.held.since : o.date;
  const held = final.result === "held"
    ? { reason: final.reason!, since, detail: final.detail, record: final.reason === "disputed" && e.held?.record ? e.held.record : rel, ...(final.reason === "disputed" && openIssues.length ? { issues: openIssues } : {}) }
    : undefined;
  const drafted = { vendor: drafter.vendor, model: drafter.model, date: drafter.date, content: d.contentSha, ...(e.drafted?.via && stampHolds ? { via: e.drafted.via } : {}) };
  writeOwned(d, { drafted, verification, held });
  log(`  wrote data/verifications/${rel}`);
  return { id, adjudication: final, skipped: false, record: rel };
}
