// The site's single data entry point. Vite resolves the glob at build time, so
// pages never touch the filesystem at render time and dev reloads on YAML edits.
// Everything below is validated; a bad entry fails the build here.
import { loadOrThrow, bySection, counts } from "./entries.ts";
import { timelineFor } from "./format.ts";
import { SITE } from "../site.ts";
import { heldInfo, type Entry, type Section } from "../schema.ts";
import type { VerificationRecord } from "../../scripts/lib/record.ts";

const globbed = import.meta.glob("../../data/entries/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const files: Record<string, string> = {};
for (const [p, raw] of Object.entries(globbed)) files[p.split("/").pop()!] = raw;

export const data = loadOrThrow(files);
export const publishable = data.publishable;
export const held = data.held;
export const siteCounts = counts(publishable);
export const heldCount = held.length;

// The public verification records, keyed by their path under data/verifications/.
const recordFiles = import.meta.glob("../../data/verifications/*/*.json", { import: "default", eager: true }) as Record<string, VerificationRecord>;
export const records = new Map<string, VerificationRecord>();
for (const [p, rec] of Object.entries(recordFiles)) records.set(p.split("/").slice(-2).join("/"), rec);

// The record an entry's verification or held block names, if it is on disk.
export function recordFor(e: Entry): { path: string; record: VerificationRecord } | null {
  const path = e.held?.record ?? e.verification?.record;
  if (!path) return null;
  const record = records.get(path);
  return record ? { path, record } : null;
}

// Held entries with their reason, for the changelog, the running head, and the JSON.
export const heldList = held.map((e) => ({ entry: e, held: heldInfo(e)!, record: recordFor(e) }));
export const because = bySection(publishable, "because");
export const notBecause = bySection(publishable, "not-because");
export const notYet = bySection(publishable, "not-yet");
export const byId = new Map(publishable.map((e) => [e.id, e]));
export const sectionLists: Record<Section, Entry[]> = { because, "not-because": notBecause, "not-yet": notYet };

// One time axis for every lag bar on the site: Jan 1 of the earliest year any
// publishable entry mentions (never later than 2019) through the reference date.
export const timeline = timelineFor(publishable, SITE.asOf);

// Previous and next entry within a section, by rank.
export function neighbours(e: Entry): { prev: Entry | null; next: Entry | null } {
  const list = sectionLists[e.section];
  const i = list.findIndex((x) => x.id === e.id);
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
}
