// `npm run validate`: validate every entry file, report held entries with
// their reason, receipt coverage, and stale window warnings; exit non-zero
// only on errors.
import { loadEntries, counts } from "../src/lib/entries.ts";
import { heldInfo, missingReceipts } from "../src/schema.ts";

const r = loadEntries();
for (const p of r.errors) console.error(`ERROR  ${p.file}: ${p.message}`);
for (const p of r.warnings) console.warn(`WARN   ${p.file}: ${p.message}`);
for (const e of r.held) {
  const why = r.unbound.get(e.id);
  const h = why ? { reason: "verification-unavailable", since: e.verification!.verifier.date, detail: `${why}; the gate has to run again` } : heldInfo(e)!;
  console.log(`held   ${e.id}.yaml: ${h.reason} since ${h.since}: ${h.detail}`);
}
for (const e of r.publishable) {
  const m = missingReceipts(e);
  if (m.length) console.warn(`WARN   ${e.id}.yaml: published without a receipt for ${m.join(", ")}`);
}
const c = counts(r.publishable);
console.log(
  `${r.all.length} entries read, ${r.publishable.length} published, ${r.held.length} held, ` +
    `${r.errors.length} error(s), ${r.warnings.length} warning(s)`,
);
console.log(`counts: ${c.because} because · ${c["not-because"]} not because · ${c["not-yet"]} not yet`);
process.exit(r.errors.length ? 1 : 0);
