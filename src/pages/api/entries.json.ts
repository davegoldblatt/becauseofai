import { data, siteCounts, heldList } from "../../lib/site.ts";
import { SITE } from "../../site.ts";

// Every entry on disk with full, unchanged fields. Held entries are included
// as part of the complete archive; the `held` list names each one with its
// reason, so a consumer can tell which entries the site publishes. The
// verification records live under data/verifications/ in the repository.
export function GET() {
  const body = {
    site: SITE.url,
    as_of: SITE.asOf,
    counts: siteCounts,
    held: heldList.map(({ entry, held }) => ({ id: entry.id, reason: held.reason, since: held.since, detail: held.detail, ...(held.record ? { record: held.record } : {}) })),
    records: `${SITE.repo}/tree/main/data/verifications`,
    entries: data.all,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
