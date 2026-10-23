// One entry through the gate: fetch (code), check quotes (code), ask the second
// vendor (one call), adjudicate (code), write the record and the entry's blocks.
// verify.ts runs this over a set of entries; dispute.ts runs it once after an
// amendment.
import { stringify } from "yaml";
import { VerdictSchema, jsonSchema, verifierSystem, verifierUser, entryForVerifier } from "./verdict.ts";
import { callStructured } from "./vendors.ts";
import { adjudicate, type VerifierOutcome } from "./adjudicate.ts";
import { readDraft, fetchPrimaries, sourcesForPrompt, checkQuotes, latestRecord, writeRecord, writeOwned, asOf, fmtTokens, type Role } from "./pipeline.ts";
import type { Adjudication, VerificationRecord, VendorRunRecord } from "./record.ts";

export type GateOptions = { drafter: Role; verifier: Role; date: string; dryRun: boolean; force: boolean; log?: (s: string) => void };
export type GateResult = { id: string; adjudication: Adjudication; skipped: boolean; record: string | null };

const VERDICT_SCHEMA = jsonSchema(VerdictSchema);

export async function runGate(id: string, o: GateOptions): Promise<GateResult> {
  const log = o.log ?? console.log;
  const d = readDraft(id);
  const e = d.entry;
  const previous = latestRecord(e);
  const unchanged = previous !== null && previous.entry_sha256 === d.contentSha && e.verification?.verifier.verdict === "pass" && !e.held;
  if (unchanged && !o.force) {
    log("  unchanged since its passing verification; skipped (--force to re-verify)");
    return { id, adjudication: previous.adjudication, skipped: true, record: e.verification!.record };
  }

  const fetched = await fetchPrimaries(e, log);
  const quoteChecks = checkQuotes(e, fetched, previous);
  for (const c of quoteChecks) if (!c.found) log(`  quote NOT FOUND for ${c.field} in source ${c.source}: ${c.note}`);

  const base = { entry: e, drafterVendor: o.drafter.vendor, verifierVendor: o.verifier.vendor, sources: fetched.fetches, quoteChecks };
  // The code's own holds come first; the model is not called for an entry the code already holds.
  const pre = adjudicate({ ...base, verifier: null });
  let outcome: VerifierOutcome = null;
  let run: VendorRunRecord | null = null;
  if (pre.reason === "verification-unavailable") {
    const receiptsYaml = stringify({ receipts: e.receipts ?? [] }, { lineWidth: 0 }).trim();
    const user = verifierUser({ asOf, entryId: id, entryYaml: entryForVerifier(d.content, receiptsYaml), quoteChecks, sources: sourcesForPrompt(fetched) });
    const r = await callStructured(o.verifier.vendor, { system: verifierSystem(asOf), user, schema: VERDICT_SCHEMA, schemaName: "verdict", validate: VerdictSchema, model: o.verifier.model, effort: o.verifier.effort });
    run = { vendor: o.verifier.vendor, model: r.model, via: r.via, date: o.date, output: r.ok ? r.output : null, error: r.ok ? null : r.error, tokens: r.ok ? r.tokens : null, duration_ms: r.durationMs };
    outcome = r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    log(`  verifier ${o.verifier.vendor} ${r.ok ? "answered" : "FAILED: " + r.error} · ${r.ok ? fmtTokens(r.tokens) : ""} · ${Math.round(r.durationMs / 1000)} s`);
    if (r.ok) log(`  verifier grades ${r.output.grades.evidence ?? "-"} · ${r.output.grades.attribution ?? "-"} · ${r.output.grades.window ?? "-"}; full text ${r.output.full_text}; ${r.output.source_kind}; receipts ${r.output.receipts.map((x) => x.status[0]).join("")}`);
  }
  const final = adjudicate({ ...base, verifier: outcome });
  // An unchanged, previously published entry is not un-published by a vendor outage.
  if (final.reason === "verification-unavailable" && unchanged) {
    log("  verifier unavailable; previous verification stands");
    return { id, adjudication: previous!.adjudication, skipped: true, record: e.verification!.record };
  }
  log(`  => ${final.result.toUpperCase()}${final.reason ? ` (${final.reason})` : ""}: ${final.detail}`);
  if (o.dryRun) return { id, adjudication: final, skipped: false, record: null };

  const record: VerificationRecord = {
    version: 1, kind: "verification", entry: id, date: o.date, as_of: asOf, entry_sha256: d.contentSha,
    drafter: { vendor: o.drafter.vendor, model: o.drafter.model, date: e.verification?.drafter.date ?? o.date },
    sources: fetched.fetches, quote_checks: quoteChecks, verifier: run, adjudication: final,
  };
  const rel = writeRecord(record);
  const verification = run && run.error === null
    ? { drafter: record.drafter!, verifier: { vendor: run.vendor, model: run.model, date: o.date, verdict: final.result === "published" ? "pass" : "fail" }, record: rel }
    : undefined;
  const since = e.held && e.held.reason === final.reason ? e.held.since : o.date;
  const held = final.result === "held" ? { reason: final.reason!, since, detail: final.detail, record: rel } : undefined;
  writeOwned(d, { verification, held });
  log(`  wrote data/verifications/${rel}`);
  return { id, adjudication: final, skipped: false, record: rel };
}
