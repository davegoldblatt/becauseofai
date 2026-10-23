// Loader for data/entries/*.yaml. Parses with YAML 1.2 core schema (no date
// coercion), validates every file against EntrySchema, and exposes two views:
//   all          every entry on disk, validated (the archive)
//   publishable  entries that may render: they carry at least one primary source
// An entry with no primary source is HELD (README, decision 1): it is not an
// error, it does not render, it is not counted, and it is never linked.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { EntrySchema, hasPrimarySource, type Entry, type Section, type DateLike } from "../schema.ts";

export const ENTRIES_DIR = fileURLToPath(new URL("../../data/entries/", import.meta.url));

export type Problem = { file: string; message: string };
export type LoadResult = {
  all: Entry[];
  publishable: Entry[];
  held: Entry[];
  errors: Problem[];
  warnings: Problem[];
};

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

export function loadEntries(opts: { today?: Date } = {}): LoadResult {
  return parseEntryFiles(readEntryFiles(), opts);
}

export function parseEntryFiles(files: Record<string, string>, opts: { today?: Date } = {}): LoadResult {
  const today = opts.today ?? new Date();
  const all: Entry[] = [];
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
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
  const held = all.filter((e) => !hasPrimarySource(e));
  const publishable = all.filter((e) => hasPrimarySource(e));
  return { all, publishable, held, errors, warnings };
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
export function loadOrThrow(files?: Record<string, string>): LoadResult {
  const r = files ? parseEntryFiles(files) : loadEntries();
  if (r.errors.length) {
    const lines = r.errors.map((p) => `  ${p.file}: ${p.message}`);
    throw new Error(`entry validation failed (${r.errors.length} error(s)):\n${lines.join("\n")}`);
  }
  return r;
}
