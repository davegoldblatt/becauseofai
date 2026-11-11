// Loader for data/entries/*.yaml. Parses with YAML 1.2 core schema (no date
// coercion), validates every file against EntrySchema, and exposes two views:
//   all          every entry on disk, validated (the archive)
//   publishable  entries that may render: a passing cross-vendor verification,
//                no held block, and at least one primary source
// Everything else is HELD (README, decision 1): it is not an error, it does not
// render, it is not counted, and it is never linked. The changelog names held
// entries with their reason.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { EntrySchema, isPublished, heldInfo, type Confidence, type Entry, type Section, type DateLike } from "../schema.ts";
import { LEGACY_STRICT, LEGACY_FROZEN_ON } from "./legacy.ts";
import { contentSha256 } from "./entry-text.ts";
import type { VerificationRecord } from "../../scripts/lib/record.ts";
import { StoredVerdictSchema as VerdictSchema } from "../../scripts/lib/verdict-schema.ts";
import { RecordSchema } from "../../scripts/lib/record-schema.ts";
import { adjudicate } from "../../scripts/lib/adjudicate.ts";
import { topBlocks } from "./entry-text.ts";

export const ENTRIES_DIR = fileURLToPath(new URL("../../data/entries/", import.meta.url));

export type Problem = { file: string; message: string };
export type LoadResult = {
  all: Entry[];
  publishable: Entry[];
  held: Entry[];
  errors: Problem[];
  warnings: Problem[];
  // Why an entry whose file says "pass" is not shown as verified: the record
  // is missing, is another entry's, did not publish, or was made for
  // different content. The entry stays published; the gate runs again on it.
  unbound: Map<string, string>;
  // How sure each published entry is (DAV-469): its bound record's level, or
  // strict for a grandfathered entry (src/lib/legacy.ts).
  levels: Map<string, Confidence>;
  // Entries whose file says "pass" but that have no bound record and are not
  // grandfathered: held until the gate runs, with the reason.
  gateDue: Map<string, string>;
};

// The held block for a held entry, including one held only because its
// verification does not bind (gateDue).
export function heldBlock(e: Entry, r: Pick<LoadResult, "gateDue">) {
  const h = heldInfo(e);
  if (h) return h;
  const why = r.gateDue.get(e.id);
  return why ? { reason: "verification-unavailable" as const, since: String(e.dates.updated).slice(0, 10), detail: `The verification on file does not stand (${why}); the gate has to run again.` } : null;
}
export type Records = Record<string, VerificationRecord>;

// The verification block is a claim; the record under data/verifications is
// the evidence. An entry publishes only when the two agree and the record was
// made for the content (and receipts) the file carries now.
export function recordMismatch(e: Entry, raw: string, records: Records): string | null {
  const v = e.verification;
  if (!v) return null;
  const raw_ = records[v.record];
  if (!raw_) return `record ${v.record} is not on disk`;
  const parsed = RecordSchema.safeParse(raw_);
  if (!parsed.success) return `record ${v.record} is malformed (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`;
  const rec = parsed.data as VerificationRecord;
  if (rec.entry !== e.id) return `record ${v.record} belongs to ${rec.entry}`;
  if (rec.kind !== "verification") return `record ${v.record} is a ${rec.kind} record, not a verification`;
  if (rec.adjudication.result !== "published") return `record ${v.record} did not publish (${rec.adjudication.reason})`;
  // The vendors, models, and dates on the entry are the record's, exactly.
  if (!rec.verifier || rec.verifier.error || rec.verifier.vendor !== v.verifier.vendor || rec.verifier.model !== v.verifier.model || rec.verifier.date !== v.verifier.date) return `record ${v.record} names a different verifier`;
  if (!rec.drafter || rec.drafter.vendor !== v.drafter.vendor || rec.drafter.model !== v.drafter.model || rec.drafter.date !== v.drafter.date) return `record ${v.record} names a different drafter`;
  if (e.drafted && (e.drafted.vendor !== v.drafter.vendor || e.drafted.model !== v.drafter.model)) return `the drafter stamp on the entry (${e.drafted.vendor} ${e.drafted.model}) is not the record's`;
  if (rec.drafter.vendor === rec.verifier.vendor) return `record ${v.record} has one vendor on both sides`;
  if (rec.entry_sha256 !== contentSha256(raw)) return `the entry changed after record ${v.record} was made`;
  // The record must carry a complete verdict and the inputs that produced the
  // decision, bound to this entry's sources and receipts, and those inputs
  // must still produce it.
  const verdict = VerdictSchema.safeParse(rec.verifier.output);
  if (!verdict.success) return `record ${v.record} carries no complete verdict`;
  const primaries = new Map(e.sources.map((s, i) => [i, s]).filter(([, s]) => s.type === "primary"));
  for (const s of rec.sources) {
    const src = primaries.get(s.index);
    if (!src || src.url !== s.url) return `record ${v.record} read a source that is not the entry's (${s.index}: ${s.url})`;
  }
  const okIdx = new Set(rec.sources.filter((s) => s.ok).map((s) => s.index));
  if (!okIdx.size) return `record ${v.record} read no source`;
  const receipts = e.receipts ?? [];
  if (rec.quote_checks.length !== receipts.length || rec.quote_checks.some((c, i) => c.field !== receipts[i].field || c.quote !== receipts[i].quote || c.source !== receipts[i].source || !c.found || !okIdx.has(c.source))) return `record ${v.record} did not check the entry's receipts against its sources`;
  const again = adjudicate({ entry: e, drafterVendor: rec.drafter.vendor, verifierVendor: rec.verifier.vendor, sources: rec.sources, quoteChecks: rec.quote_checks, verifier: { ok: true, output: verdict.data } });
  if (again.result !== "published") return `record ${v.record} does not re-derive as published (${again.reason})`;
  // The level on the entry is the one its record derives, exactly (DAV-469).
  if ((v.confidence ?? "strict") !== (again.confidence ?? "strict")) return `the entry says ${v.confidence ?? "strict"} but record ${v.record} derives ${again.confidence ?? "strict"}`;
  // So are the reasons shown for a level below strict.
  if (JSON.stringify(v.relaxed ?? []) !== JSON.stringify(again.relaxed ?? [])) return `the reasons on the entry for its level are not the ones record ${v.record} derives`;
  return null;
}

// Read every data/verifications/<id>/<file>.json from disk (node scripts).
export function readRecordFiles(dir: string = path.resolve(ENTRIES_DIR, "../verifications")): Records {
  const out: Records = {};
  if (!fs.existsSync(dir)) return out;
  for (const id of fs.readdirSync(dir)) {
    const sub = path.join(dir, id);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of fs.readdirSync(sub).filter((x) => x.endsWith(".json"))) {
      try { out[`${id}/${f}`] = JSON.parse(fs.readFileSync(path.join(sub, f), "utf8")); } catch { /* a bad record binds nothing */ }
    }
  }
  return out;
}

export function dateToString(d: DateLike | null): string | null {
  if (d === null || d === undefined) return null;
  return typeof d === "number" ? String(d) : d;
}

// The latest calendar day a date as written could mean: "2025" -> Dec 31 2025,
// "2025-10" -> Oct 31 2025, "2025-10-28" -> that day.
export function latestDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (d) return new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  if (m) return new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return new Date(Date.UTC(y, 11, 31, 23, 59, 59));
}

// The 12-month window ends on `today`. A grade of "in" is stale when the achieved
// end (or, for an open-ended entry, the start) now falls before the window; an
// "ongoing" grade is stale when a closed achieved end does. This is a WARNING for
// the weekly research run, never an automatic change to the grade.
export function staleWindowReason(e: Entry, today: Date): string | null {
  const w = e.grades.window;
  if (w !== "in" && w !== "ongoing") return null;
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate()));
  const ref = e.dates.achieved_end ?? (w === "in" ? e.dates.achieved_start : null);
  if (ref === null || ref === undefined) return null;
  const s = dateToString(ref)!;
  if (latestDay(s) < cutoff) {
    return `window is "${w}" but the achieved date ${s} falls before ${cutoff.toISOString().slice(0, 10)}, the start of the 12-month window ending ${today.toISOString().slice(0, 10)}; re-grade or re-verify`;
  }
  return null;
}

// Read every data/entries/*.yaml from disk (node scripts). Astro pages use
// src/lib/site.ts instead, which hands the same loader Vite-globbed raw text so
// the build does not depend on the working directory.
export function readEntryFiles(dir: string = ENTRIES_DIR): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    out[file] = fs.readFileSync(path.join(dir, file), "utf8");
  }
  return out;
}

export function loadEntries(opts: { today?: Date; records?: Records } = {}): LoadResult {
  return parseEntryFiles(readEntryFiles(), { ...opts, records: opts.records ?? readRecordFiles() });
}

export function parseEntryFiles(files: Record<string, string>, opts: { today?: Date; records?: Records; legacy?: ReadonlyMap<string, string> } = {}): LoadResult {
  const today = opts.today ?? new Date();
  const records = opts.records ?? {};
  const legacy = opts.legacy ?? LEGACY_STRICT;
  const all: Entry[] = [];
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const unbound = new Map<string, string>();
  const seenIds = new Map<string, string>();
  const raws = new Map<string, string>();
  for (const file of Object.keys(files).sort()) {
    const raw = files[file];
    let doc: unknown;
    try {
      doc = parse(raw, { schema: "core" });
    } catch (err) {
      errors.push({ file, message: `YAML parse error: ${(err as Error).message}` });
      continue;
    }
    // Only a block mapping at column 0, without anchors, is a supported layout: the
    // pipeline cannot edit anything else, so nothing else publishes.
    try { topBlocks(raw); } catch (err) { errors.push({ file, message: (err as Error).message }); continue; }
    const result = EntrySchema.safeParse(doc);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ file, message: `${issue.path.join(".") || "(root)"}: ${issue.message}` });
      }
      continue;
    }
    const e = result.data;
    if (`${e.id}.yaml` !== file) errors.push({ file, message: `id "${e.id}" does not match the filename` });
    if (seenIds.has(e.id)) errors.push({ file, message: `duplicate id "${e.id}" (also in ${seenIds.get(e.id)})` });
    seenIds.set(e.id, file);
    raws.set(e.id, raw);
    if (isPublished(e)) {
      let why: string | null;
      try { why = recordMismatch(e, raw, records); } catch (err) { why = `could not hash the entry: ${(err as Error).message}`; }
      if (why) { unbound.set(e.id, why); warnings.push({ file, message: `verification not shown: ${why}; the gate has to run again` }); }
    }
    all.push(e);
  }
  const ids = new Set(all.map((e) => e.id));
  for (const e of all) {
    for (const r of e.related ?? []) {
      if (!ids.has(r)) errors.push({ file: `${e.id}.yaml`, message: `related id "${r}" does not exist` });
    }
    const stale = staleWindowReason(e, today);
    if (stale) warnings.push({ file: `${e.id}.yaml`, message: stale });
  }
  // Rank must be unique within a section, or the editorial order is ambiguous.
  const byRank = new Map<string, string>();
  for (const e of all) {
    const key = `${e.section}:${e.rank}`;
    if (byRank.has(key)) errors.push({ file: `${e.id}.yaml`, message: `rank ${e.rank} is already used in ${e.section} by ${byRank.get(key)}` });
    byRank.set(key, e.id);
  }
  // An entry the gate has not bound publishes only if it is grandfathered:
  // on the frozen list, its content unchanged since the freeze, and no gate
  // verification record made for it after the freeze. An entry that carries
  // a verification block is never grandfathered; its record must bind.
  const verifiedSinceFreeze = new Set<string>();
  for (const [key, rec] of Object.entries(records)) {
    const [id, file] = key.split("/");
    if (legacy.has(id) && (rec as { kind?: string } | null)?.kind === "verification" && file.slice(0, 10) > LEGACY_FROZEN_ON) verifiedSinceFreeze.add(id);
  }
  const grandfathered = (id: string) => legacy.has(id) && !verifiedSinceFreeze.has(id) && raws.has(id) && contentSha256(raws.get(id)!) === legacy.get(id);
  const gateDue = new Map<string, string>();
  for (const e of all) {
    if (!isPublished(e)) continue;
    if (!e.verification) { if (!grandfathered(e.id)) gateDue.set(e.id, legacy.has(e.id) ? "changed since it was grandfathered, and not verified" : "no verification"); }
    else if (unbound.has(e.id)) gateDue.set(e.id, unbound.get(e.id)!);
  }
  const held = all.filter((e) => !isPublished(e) || gateDue.has(e.id));
  const publishable = all.filter((e) => isPublished(e) && !gateDue.has(e.id));
  const levels = new Map<string, Confidence>(publishable.map((e) => [e.id, unbound.has(e.id) ? "strict" : (e.verification?.confidence ?? "strict")]));
  return { all, publishable, held, errors, warnings, unbound, levels, gateDue };
}

export function bySection(entries: Entry[], section: Section): Entry[] {
  return entries.filter((e) => e.section === section).sort((a, b) => a.rank - b.rank);
}

export function counts(entries: Entry[]): Record<Section, number> {
  return {
    because: entries.filter((e) => e.section === "because").length,
    "not-because": entries.filter((e) => e.section === "not-because").length,
    "not-yet": entries.filter((e) => e.section === "not-yet").length,
  };
}

// Throws when any entry is invalid, so `astro build` fails on bad data.
export function loadOrThrow(files?: Record<string, string>, records?: Records): LoadResult {
  const r = files ? parseEntryFiles(files, { records }) : loadEntries();
  if (r.errors.length) {
    const lines = r.errors.map((p) => `  ${p.file}: ${p.message}`);
    throw new Error(`entry validation failed (${r.errors.length} error(s)):\n${lines.join("\n")}`);
  }
  return r;
}
