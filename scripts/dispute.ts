// A reader's dispute (DAV-376, stage 4). Both vendors assess the dispute
// against the primary source text (and the reader's source, if they linked
// one). Both uphold: the entry is amended with the corrections they agree on,
// a history line names the issue, and the amended entry goes back through the
// gate. Both reject: the issue is closed with both reasonings and a history
// line. Otherwise the entry is held (disputed) with both verdicts public and
// the issue stays open. No human step.
//
//   node scripts/dispute.ts --issue <n> [--dry-run] [--date YYYY-MM-DD]
//   needs: gh (GH_TOKEN) and REPO=owner/name (default from the git remote)
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { DisputeVerdictSchema, jsonSchema, disputeSystem, disputeUser, entryForModel, type DisputeVerdict } from "./lib/verdict.ts";
import { callStructured } from "./lib/vendors.ts";
import { runGate } from "./lib/gate.ts";
import { loadVendorConfig, todayUtc, readDraft, fetchPrimaries, sourcesForPrompt, writeRecord, asOf, fmtTokens, ROOT, type Role } from "./lib/pipeline.ts";
import { fetchSourceText, normalizeForMatch } from "./lib/source-text.ts";
import { appendHistory, appendSource, setScalar, withOwned, readOwned } from "./lib/yaml-edit.ts";
import { RECEIPT_FIELDS, wordCount, RECEIPT_MAX_WORDS, heldInfo } from "../src/schema.ts";
import { loadEntries } from "../src/lib/entries.ts";
import type { VendorRunRecord, VerificationRecord } from "./lib/record.ts";
import type { SourceForPrompt } from "./lib/verdict.ts";

const argv = process.argv.slice(2);
const opt = (name: string): string | null => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const flag = (name: string) => argv.includes(name);
const issueNo = Number(opt("--issue"));
if (!issueNo) { console.error("usage: dispute.ts --issue <n>"); process.exit(1); }
const dryRun = flag("--dry-run");
const date = opt("--date") ?? todayUtc();
const repo = process.env.REPO || (() => {
  const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: ROOT, encoding: "utf8" }).trim();
  const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(url);
  if (!m) throw new Error(`cannot read owner/repo from ${url}`);
  return m[1];
})();

const gh = (args: string[], input?: string): string => execFileSync("gh", args, { encoding: "utf8", input, cwd: ROOT });
const ghJson = (args: string[]) => JSON.parse(gh(args));

// Fields a dispute may change. Never id, section, rank, dates.added, sources (added, never edited), history.
const EDITABLE = new Set(["headline", "impact", "impact_number", "impact_label", "summary", "caveat", "comparison", "effect.relative", "effect.absolute", "reach", "conflicts", "what_would_change", "grades.evidence", "grades.attribution", "grades.window", "dates.achieved_start", "dates.achieved_end", "dates.published", "ai_type", "domain"]);

type Issue = { number: number; title: string; body: string; state: string; labels: { name: string }[] };
const issue = ghJson(["api", `repos/${repo}/issues/${issueNo}`]) as Issue;
if (issue.state !== "open") { console.log(`issue #${issueNo} is ${issue.state}; nothing to do`); process.exit(0); }

// The issue form renders as "### Label\n\nvalue" sections.
function section(body: string, label: RegExp): string {
  const m = new RegExp(`###\\s*${label.source}[^\\n]*\\n+([\\s\\S]*?)(?=\\n###\\s|$)`, "i").exec(body);
  return m ? m[1].trim() : "";
}
const entryField = section(issue.body ?? "", /Entry/) || issue.title;
const idMatch = /entry\/([a-z0-9-]+)/.exec(entryField) ?? /\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/.exec(entryField);
const id = idMatch?.[1];
if (!id || !fs.existsSync(`${ROOT}/data/entries/${id}.yaml`)) {
  const msg = `This dispute does not name an entry the registry has (read "${entryField.slice(0, 80)}"). Use the entry id or its URL, for example \`golden-bridge-ii-stroke\` or https://becauseofai.org/entry/golden-bridge-ii-stroke, and open a new dispute.`;
  console.log(msg);
  if (!dryRun) { gh(["api", `repos/${repo}/issues/${issueNo}/comments`, "-f", `body=${msg}`]); gh(["api", "-X", "PATCH", `repos/${repo}/issues/${issueNo}`, "-f", "state=closed", "-f", "state_reason=not_planned"]); }
  process.exit(0);
}
const claim = [section(issue.body ?? "", /What are you disputing/), section(issue.body ?? "", /Why/)].filter(Boolean).join("\n\n") || issue.body || issue.title;
console.log(`dispute #${issueNo} on ${id}: ${issue.title}`);

const cfg = loadVendorConfig();
const d = readDraft(id);
const e = d.entry;
const fetched = await fetchPrimaries(e, console.log);
const sources = sourcesForPrompt(fetched);
// The reader's source: the first link in the dispute that is not already one of the entry's sources.
const known = new Set(e.sources.map((s) => s.url.replace(/\/+$/, "")));
const linked = [...claim.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0].replace(/[.,;]+$/, "")).find((u) => !known.has(u.replace(/\/+$/, ""))) ?? null;
let disputant: SourceForPrompt | null = null;
if (linked) {
  const r = await fetchSourceText(linked);
  if (r.ok) { disputant = { index: -1, url: linked, method: r.method, sha256: r.sha256, text: r.text }; console.log(`  reader's source: ${r.method} ${r.chars} chars`); }
  else console.log(`  reader's source could not be read: ${r.reason}`);
}
// The issue is public input: bounded before it reaches a model or a record.
const boundedClaim = claim.slice(0, 6000);
const user = disputeUser({ asOf, entryId: id, entryYaml: entryForModel(e), issue: { number: issueNo, title: issue.title.slice(0, 200), body: boundedClaim }, sources, disputantSource: disputant });
const schema = jsonSchema(DisputeVerdictSchema);

const runs: VendorRunRecord[] = [];
const verdicts: (DisputeVerdict | null)[] = [];
for (const role of [cfg.drafter, cfg.verifier] as Role[]) {
  const r = await callStructured(role.vendor, { system: disputeSystem(asOf), user, schema, schemaName: "dispute", validate: DisputeVerdictSchema, model: role.model, effort: role.effort });
  runs.push({ vendor: role.vendor, model: r.model, via: r.via, date, output: r.ok ? r.output : null, error: r.ok ? null : r.error, tokens: r.ok ? r.tokens : null, duration_ms: r.durationMs });
  verdicts.push(r.ok ? r.output : null);
  console.log(`  ${role.vendor}: ${r.ok ? (r.output.upheld ? "UPHELD" : "not upheld") + " · " + fmtTokens(r.tokens) : "FAILED: " + r.error}`);
}
const [a, b] = verdicts;
const outcome: "upheld" | "rejected" | "split" = a && b ? (a.upheld && b.upheld ? "upheld" : !a.upheld && !b.upheld ? "rejected" : "split") : "split";

// Corrections both vendors agree on, field by field.
const norm = (v: string | null) => (v === null ? null : normalizeForMatch(v));
const agreed = outcome === "upheld"
  ? a!.changes.filter((c) => EDITABLE.has(c.field) && b!.changes.some((o) => o.field === c.field && norm(o.value) === norm(c.value)))
  : [];
const finalOutcome = outcome === "upheld" && !agreed.length ? "split" : outcome;
console.log(`  outcome: ${finalOutcome}${agreed.length ? ` (${agreed.map((c) => c.field).join(", ")})` : ""}`);

// The entry's state after the dispute is whatever the gate (or the current
// file) says; the dispute record states the dispute's outcome and that state
// separately, and is written only once both are known.
function currentState(): { result: "published" | "held"; reason: string | null; detail: string } {
  const r = loadEntries();
  const cur = r.all.find((x) => x.id === id)!;
  const why = r.unbound.get(id);
  if (r.publishable.some((x) => x.id === id)) return { result: "published", reason: null, detail: "Published." };
  const h = why ? { reason: "verification-unavailable", detail: why } : heldInfo(cur)!;
  return { result: "held", reason: h.reason, detail: h.detail };
}
const disputeDetail = finalOutcome === "upheld" ? `Dispute #${issueNo} upheld by both vendors; corrected ${agreed.map((c) => c.field).join(", ")}.`
  : finalOutcome === "rejected" ? `Dispute #${issueNo} not upheld by either vendor; entry unchanged.`
  : `Dispute #${issueNo} split the vendors: ${runs.map((r, i) => `${r.vendor} ${verdicts[i] ? (verdicts[i]!.upheld ? "upheld" : "rejected") : "failed"}`).join(", ")}.`;
const writeDisputeRecord = (state: { result: "published" | "held"; reason: string | null; detail: string }, gateRecord?: string): string => writeRecord({
  version: 1, kind: "dispute", entry: id, date, as_of: asOf, entry_sha256: d.contentSha,
  drafter: e.drafted ?? e.verification?.drafter ?? null, sources: fetched.fetches, quote_checks: [], verifier: null,
  adjudication: { result: state.result, reason: (state.reason as VerificationRecord["adjudication"]["reason"]) ?? null, detail: `${disputeDetail} ${state.detail}${gateRecord ? ` Gate record: ${gateRecord}.` : ""}` },
  dispute: { issue: issueNo, title: issue.title.slice(0, 200), claim: boundedClaim, verdicts: runs, outcome: finalOutcome },
}, `-dispute-${issueNo}`);
const reasoning = runs.map((r, i) => `**${r.vendor}** (${r.model}): ${verdicts[i] ? `${verdicts[i]!.upheld ? "upheld" : "not upheld"}. ${verdicts[i]!.reasoning}` : `could not answer (${r.error}).`}`).join("\n\n");
if (dryRun) { console.log(reasoning); process.exit(0); }

const link = (rel: string) => `https://github.com/${repo}/blob/main/data/verifications/${rel}`;
let text = d.raw;

if (finalOutcome === "rejected") {
  text = appendHistory(text, { date, note: `Verified against dispute #${issueNo}: not upheld by either vendor.` });
  fs.writeFileSync(d.file, text);
  const rel = writeDisputeRecord(currentState());
  gh(["api", `repos/${repo}/issues/${issueNo}/comments`, "-f", `body=Two models from different vendors assessed this dispute against the primary source and neither upheld it. The entry is unchanged.\n\n${reasoning}\n\nRecord: ${link(rel)}`]);
  gh(["api", "-X", "PATCH", `repos/${repo}/issues/${issueNo}`, "-f", "state=closed", "-f", "state_reason=completed"]);
  console.log(`closed #${issueNo}: not upheld`);
} else if (finalOutcome === "split") {
  const rel = writeDisputeRecord({ result: "held", reason: "disputed", detail: "Held while the vendors disagree." });
  const owned = readOwned(text);
  text = withOwned(text, { ...owned, held: { reason: "disputed", since: date, detail: disputeDetail, record: rel } });
  text = appendHistory(text, { date, note: `Updated: held while dispute #${issueNo} splits the two vendors.` });
  fs.writeFileSync(d.file, text);
  gh(["api", `repos/${repo}/issues/${issueNo}/comments`, "-f", `body=The two vendors disagree on this dispute, so the entry is held (off the counted list) until they agree. This issue stays open.\n\n${reasoning}\n\nRecord: ${link(rel)}`]);
  console.log(`held ${id} as disputed; #${issueNo} stays open`);
} else {
  // Apply the agreed corrections, with a receipt for every numeric value, then re-run the gate.
  let reflowed = false;
  let srcIndex = new Map<number, number>();
  const receipts = (readOwned(text).receipts as { field: string; quote: string; locator: string; source: number }[] | undefined) ?? [];
  for (const c of agreed) {
    const path = c.field.split(".");
    const current = path.reduce<any>((o, k) => (o == null ? undefined : o[k]), e);
    const value = c.value === null ? null : /^(grades\.|dates\.)/.test(c.field) || typeof current === "number" ? c.value : c.value;
    const r = setScalar(text, path, value);
    text = r.text; reflowed ||= r.reflowed;
    if ((RECEIPT_FIELDS as readonly string[]).includes(c.field)) {
      let source = c.source;
      if (source === -1 && disputant) {
        if (!srcIndex.has(-1)) { const s = appendSource(text, { title: `Reader's source for dispute #${issueNo}`, url: disputant.url, type: "primary" }); text = s.text; srcIndex.set(-1, s.index); }
        source = srcIndex.get(-1)!;
      }
      const kept = receipts.filter((x) => x.field !== c.field);
      if (c.quote.trim() && c.locator.trim() && wordCount(c.quote) <= RECEIPT_MAX_WORDS && source >= 0) kept.push({ field: c.field, quote: c.quote.trim(), locator: c.locator.trim(), source });
      receipts.splice(0, receipts.length, ...kept);
    }
  }
  text = setScalar(text, ["dates", "updated"], date).text;
  text = appendHistory(text, { date, note: `Corrected ${agreed.map((c) => c.field).join(", ")} per dispute #${issueNo}, upheld by both vendors.` });
  text = withOwned(text, { receipts, verification: undefined, held: undefined });
  fs.writeFileSync(d.file, text);
  if (reflowed) console.log("  note: a missing key was added through the document API; the file was re-flowed");
  console.log(`  amended ${id}: ${agreed.map((c) => `${c.field} -> ${c.value}`).join("; ")}`);
  const gate = await runGate(id, { drafter: e.drafted ? { vendor: e.drafted.vendor, model: e.drafted.model } : cfg.drafter, verifier: cfg.verifier, date, dryRun: false, force: true, resolvesDispute: issueNo });
  const rel = writeDisputeRecord(gate.adjudication.result === "published" ? { result: "published", reason: null, detail: "The amended entry passed the gate." } : { result: "held", reason: gate.adjudication.reason, detail: gate.adjudication.detail }, gate.record ?? undefined);
  const outcomeLine = gate.adjudication.result === "published" ? "The amended entry passed the gate and is published." : `The amended entry is held (${gate.adjudication.reason}): ${gate.adjudication.detail}`;
  gh(["api", `repos/${repo}/issues/${issueNo}/comments`, "-f", `body=Upheld by both vendors. Changed: ${agreed.map((c) => `\`${c.field}\``).join(", ")}. ${outcomeLine}\n\n${reasoning}\n\nRecord: ${link(rel)}`]);
  gh(["api", "-X", "PATCH", `repos/${repo}/issues/${issueNo}`, "-f", "state=closed", "-f", "state_reason=completed"]);
  console.log(`closed #${issueNo}: upheld`);
}
