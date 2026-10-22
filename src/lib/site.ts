// The site's single data entry point. Vite resolves the glob at build time, so
// pages never touch the filesystem at render time and dev reloads on YAML edits.
// Everything below is validated; a bad entry fails the build here.
import { loadOrThrow, bySection, counts } from "./entries.ts";

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
export const because = bySection(publishable, "because");
export const notBecause = bySection(publishable, "not-because");
export const notYet = bySection(publishable, "not-yet");
export const byId = new Map(publishable.map((e) => [e.id, e]));
