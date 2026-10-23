// Shared plumbing for verify.ts, receipts.ts and dispute.ts: the vendor
// configuration, reading an entry as a draft, fetching its primary sources,
// checking its quotes, and writing records and entry blocks.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parse } from "yaml";
import { DraftEntrySchema, VENDORS, type Entry, type Vendor } from "../../src/schema.ts";
import { ENTRIES_DIR } from "../../src/lib/entries.ts";
import { SITE } from "../../src/site.ts";
import { fetchSourceText, findQuote, type SourceText } from "./source-text.ts";
import { contentSha256, stripOwned, withOwned, type Owned } from "./yaml-edit.ts";
import type { QuoteCheck, SourceFetch, VerificationRecord } from "./record.ts";
import type { Effort } from "./vendors.ts";
import type { SourceForPrompt } from "./verdict.ts";

export const ROOT = path.resolve(ENTRIES_DIR, "../..");
export const RECORDS_DIR = path.join(ROOT, "data", "verifications");
export const MAX_PRIMARY_SOURCES = 3;

export type Role = { vendor: Vendor; model: string; effort?: Effort };
export type VendorConfig = { drafter: Role; verifier: Role; max_entries_per_run: number };

export function loadVendorConfig(): VendorConfig {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "research", "vendors.json"), "utf8")) as VendorConfig;
  for (const r of [cfg.drafter, cfg.verifier]) {
    if (!(VENDORS as readonly string[]).includes(r.vendor)) throw new Error(`vendors.json: unknown vendor ${r.vendor}`);
    if (!r.model) throw new Error(`vendors.json: ${r.vendor} has no model`);
  }
  if (cfg.drafter.vendor === cfg.verifier.vendor) throw new Error(`vendors.json: drafter and verifier are both ${cfg.drafter.vendor}; refusing to run`);
  return cfg;
}

// "vendor:model" from the command line, or the configured role.
export function parseRole(s: string | undefined, fallback: Role): Role {
  if (!s) return fallback;
  const [vendor, ...rest] = s.split(":");
  const model = rest.join(":");
  if (!(VENDORS as readonly string[]).includes(vendor) || !model) throw new Error(`expected vendor:model, got ${s}`);
  return { vendor: vendor as Vendor, model };
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export type DraftEntry = { id: string; file: string; raw: string; content: string; contentSha: string; entry: Entry };

export function readDraft(id: string): DraftEntry {
  const file = path.join(ENTRIES_DIR, `${id}.yaml`);
  const raw = fs.readFileSync(file, "utf8");
  const content = stripOwned(raw);
  const doc = parse(raw, { schema: "core" });
  const r = DraftEntrySchema.safeParse(doc);
  if (!r.success) throw new Error(`${id}.yaml: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  if (r.data.id !== id) throw new Error(`${id}.yaml: id is ${r.data.id}`);
  return { id, file, raw, content, contentSha: contentSha256(raw), entry: r.data as Entry };
}

export function allEntryIds(): string[] {
  return fs.readdirSync(ENTRIES_DIR).filter((f) => f.endsWith(".yaml")).map((f) => f.slice(0, -5)).sort();
}

// Entry files added or modified since `base` (committed) plus any uncommitted change.
export function changedEntryIds(base: string): string[] {
  const ids = new Set<string>();
  const pick = (out: string) => out.split("\n").map((l) => l.trim()).filter(Boolean).forEach((l) => { const m = /data\/entries\/([a-z0-9-]+)\.yaml$/.exec(l); if (m) ids.add(m[1]); });
  pick(execSync(`git diff --name-only --diff-filter=AM ${base}...HEAD -- data/entries/`, { cwd: ROOT, encoding: "utf8" }));
  pick(execSync(`git status --porcelain -- data/entries/`, { cwd: ROOT, encoding: "utf8" }).replace(/^.{3}/gm, ""));
  return [...ids].filter((id) => fs.existsSync(path.join(ENTRIES_DIR, `${id}.yaml`))).sort();
}

export type Fetched = { fetches: SourceFetch[]; texts: Map<number, SourceText & { ok: true }> };

// Every primary source, fetched by code. The texts map holds the ones that came back in full.
export async function fetchPrimaries(e: Entry, log: (s: string) => void = () => {}): Promise<Fetched> {
  const fetches: SourceFetch[] = [];
  const texts = new Map<number, SourceText & { ok: true }>();
  const primaries = e.sources.map((s, index) => ({ s, index })).filter(({ s }) => s.type === "primary").slice(0, MAX_PRIMARY_SOURCES);
  for (const { s, index } of primaries) {
    const t0 = Date.now();
    const r = await fetchSourceText(s.url);
    const fetched_at = new Date().toISOString();
    if (r.ok) {
      texts.set(index, r);
      fetches.push({ index, url: s.url, ok: true, method: r.method, fetched_at, final_url: r.finalUrl, sha256: r.sha256, chars: r.chars, truncated: r.truncated });
      log(`  source ${index}: ${r.method} ${r.chars} chars${r.truncated ? " (truncated)" : ""} ${Date.now() - t0} ms`);
    } else {
      fetches.push({ index, url: s.url, ok: false, method: r.method, fetched_at, reason: r.reason });
      log(`  source ${index}: NOT READ (${r.reason})`);
    }
  }
  return { fetches, texts };
}

export function sourcesForPrompt(f: Fetched): SourceForPrompt[] {
  return [...f.texts.entries()].map(([index, t]) => ({ index, url: t.url, method: t.method, sha256: t.sha256, text: t.text }));
}

// The code's own check of every receipt, before any model sees the entry. A
// quote that was found against an earlier fetch (by sha256) and is not found now is stale.
export function checkQuotes(e: Entry, f: Fetched, previous: VerificationRecord | null): QuoteCheck[] {
  const prevSha = new Map<number, string>();
  for (const s of previous?.sources ?? []) if (s.ok && s.sha256) prevSha.set(s.index, s.sha256);
  return (e.receipts ?? []).map((r) => {
    const t = f.texts.get(r.source);
    if (!t) {
      const fetch = f.fetches.find((x) => x.index === r.source);
      return { field: r.field, source: r.source, quote: r.quote, found: false, exact: false, status: "unsupported", note: fetch ? `source ${r.source} could not be read: ${fetch.reason}` : `source ${r.source} is not a primary source` };
    }
    const m = findQuote(t.text, r.quote);
    if (m.found) return { field: r.field, source: r.source, quote: r.quote, found: true, exact: m.exact, status: "supported" };
    const changed = prevSha.has(r.source) && prevSha.get(r.source) !== t.sha256;
    return { field: r.field, source: r.source, quote: r.quote, found: false, exact: false, status: changed ? "stale" : "unsupported", note: changed ? "the source text changed since the receipt was written" : "quote not found in the source text" };
  });
}

export function latestRecord(e: Entry): VerificationRecord | null {
  const rel = e.held?.record ?? e.verification?.record;
  if (!rel) return null;
  const p = path.join(RECORDS_DIR, rel);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")) as VerificationRecord; } catch { return null; }
}

// Write a record as data/verifications/<id>/<date>[-<n>][-<suffix>].json; returns the path under data/verifications/.
export function writeRecord(record: VerificationRecord, suffix = ""): string {
  const dir = path.join(RECORDS_DIR, record.entry);
  fs.mkdirSync(dir, { recursive: true });
  let name = `${record.date}${suffix}`;
  let n = 1;
  while (fs.existsSync(path.join(dir, `${name}.json`))) name = `${record.date}-${++n}${suffix}`;
  const rel = `${record.entry}/${name}.json`;
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(record, null, 2) + "\n");
  return rel;
}

export function writeOwned(d: DraftEntry, owned: Owned): void {
  fs.writeFileSync(d.file, withOwned(d.raw, owned));
}

export const asOf = SITE.asOf;
export const fmtTokens = (t: { total: number } | null | undefined) => (t ? `${t.total.toLocaleString("en-US")} tokens` : "tokens n/a");
