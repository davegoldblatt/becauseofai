// The site's single data entry point. Vite resolves the glob at build time, so
// pages never touch the filesystem at render time and dev reloads on YAML edits.
// Everything below is validated; a bad entry fails the build here.
import { loadOrThrow, bySection, counts } from "./entries.ts";
import { timelineFor, isUnreviewed } from "./format.ts";
import { SITE } from "../site.ts";
import type { Entry, Section } from "../schema.ts";

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
// Counts of entries a person has read: the tabs and the share card
// use these; the running head adds "N unreviewed".
export const reviewed = publishable.filter((e) => !isUnreviewed(e));
export const reviewedCounts = counts(reviewed);
export const unreviewedCount = publishable.length - reviewed.length;
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
