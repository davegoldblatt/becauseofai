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
import { EntrySchema, isPublished, type Entry, type Section, type DateLike } from "../schema.ts";
import { contentSha256 } from "./entry-text.ts";
import type { VerificationRecord } from "../../scripts/lib/record.ts";

export const ENTRIES_DIR = fileURLToPath(new URL("../../data/entries/", import.meta.url));

export type Problem = { file: string; message: string };
export type LoadResult = {
  all: Entry[];
  publishable: Entry[];
  held: Entry[];
  errors: Problem[];
  warnings: Problem[];
  // Why an entry whose file says "pass" is held anyway: the record is missing,
  // is another entry's, did not publish, or was made for different content.
  unbound: Map<string, string>;
};
export type Records = Record<string, VerificationRecord>;

// The verification block is a claim; the record under data/verifications is
// the evidence. An entry publishes only when the two agree and the record was
// made for the content (and receipts) the file carries now.
export function recordMismatch(e: Entry, raw: string, records: Records): string | null {
  const v = e.verification;
  if (!v) return null;
  const rec = records[v.record];
  if (!rec) return `record ${v.record} is not on disk`;
  if (rec.entry !== e.id) return `record ${v.record} belongs to ${rec.entry}`;
  if (rec.kind !== "verification") return `record ${v.record} is a ${rec.kind} record, not a verification`;
  if (rec.adjudication.result !== "published") return `record ${v.record} did not publish (${rec.adjudication.reason})`;
  if (!rec.verifier || rec.verifier.error || rec.verifier.vendor !== v.verifier.vendor || rec.verifier.model !== v.verifier.model) return `record ${v.record} names a different verifier`;
  if (!rec.drafter || rec.drafter.vendor !== v.drafter.vendor) return `record ${v.record} names a different drafter`;
  if (rec.entry_sha256 !== contentSha256(raw)) return `the entry changed after record ${v.record} was made`;
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

export function parseEntryFiles(files: Record<string, string>, opts: { today?: Date; records?: Records } = {}): LoadResult {
  const today = opts.today ?? new Date();
  const records = opts.records ?? {};
  const all: Entry[] = [];
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const unbound = new Map<string, string>();
  const seenIds = new Map<string, string>();
  for (const file of Object.keys(files).sort()) {
    const raw = files[file];
    let doc: unknown;
    try {
      doc = parse(raw, { schema: "core" });
    } catch (err) {
      errors.push({ file, message: `YAML parse error: ${(err as Error).message}` });
      continue;
    }
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
    if (isPublished(e)) {
      let why: string | null;
      try { why = recordMismatch(e, raw, records); } catch (err) { why = `could not hash the entry: ${(err as Error).message}`; }
      if (why) { unbound.set(e.id, why); warnings.push({ file, message: `held: ${why}; the gate has to run again` }); }
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
  const published = (e: Entry) => isPublished(e) && !unbound.has(e.id);
  const held = all.filter((e) => !published(e));
  const publishable = all.filter(published);
  return { all, publishable, held, errors, warnings, unbound };
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
