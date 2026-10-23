import { data, siteCounts, reviewedCounts } from "../../lib/site.ts";
import { isUnreviewed } from "../../lib/format.ts";
import { SITE } from "../../site.ts";

// Every entry on disk with full, unchanged fields. Held entries (no primary
// source) are included here as the complete archive; their ids are listed
// separately so a consumer can tell which ones the site does not publish.
// Unreviewed entries (published by the research run, not yet read by the
// editor) are listed the same way, so the quarantine rides in the data too.
export function GET() {
  const body = {
    site: SITE.url,
    as_of: SITE.asOf,
    counts: siteCounts,
    counts_reviewed: reviewedCounts,
    held: data.held.map((e) => e.id),
    unreviewed: data.publishable.filter(isUnreviewed).map((e) => e.id),
    entries: data.all,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
