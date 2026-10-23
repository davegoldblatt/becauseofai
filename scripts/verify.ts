// The gate (DAV-376). For each entry: fetch its primary sources (code), check
// every receipt's quote against the text (code), ask the second vendor for a
// verdict (one model call, no tools), adjudicate (code), then write the public
// record and the entry's verification or held block.
//
//   node scripts/verify.ts --changed [--base origin/main]   entries added or changed since base
//   node scripts/verify.ts --entry <id>[,<id>]
//   node scripts/verify.ts --all
//   options: --drafter vendor:model (who drafted; default research/vendors.json)
//            --verifier vendor:model[:effort] (default research/vendors.json; for measuring)
//            --date YYYY-MM-DD  --dry-run  --max N (0 = no cap)  --force (re-verify unchanged entries)
//
// Exit 0 when the gate ran, whatever it decided; 1 on an error of the pipeline itself.
import { availability } from "./lib/vendors.ts";
import { runGate } from "./lib/gate.ts";
import { loadVendorConfig, parseRole, todayUtc, allEntryIds, changedEntryIds, asOf } from "./lib/pipeline.ts";

const argv = process.argv.slice(2);
const opt = (name: string): string | null => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const flag = (name: string) => argv.includes(name);

const cfg = loadVendorConfig();
const drafter = parseRole(opt("--drafter") ?? undefined, cfg.drafter);
const verifier = (() => {
  const v = opt("--verifier");
  if (!v) return cfg.verifier;
  const [vendor, model, effort] = v.split(":");
  return { ...parseRole(`${vendor}:${model}`, cfg.verifier), effort: (effort as typeof cfg.verifier.effort) ?? cfg.verifier.effort };
})();
if (drafter.vendor === verifier.vendor) { console.error(`refusing to run: drafter and verifier are both ${drafter.vendor}`); process.exit(1); }
const date = opt("--date") ?? todayUtc();
const dryRun = flag("--dry-run");
const force = flag("--force");
const max = opt("--max") !== null ? Number(opt("--max")) : cfg.max_entries_per_run;

let ids: string[];
if (flag("--all")) ids = allEntryIds();
else if (opt("--entry")) ids = opt("--entry")!.split(",").map((s) => s.trim()).filter(Boolean);
else if (flag("--changed")) ids = changedEntryIds(opt("--base") ?? "origin/main");
else { console.error("usage: verify.ts --changed [--base REF] | --entry a,b | --all"); process.exit(1); }

if (!ids.length) { console.log("nothing to verify"); process.exit(0); }
if (max > 0 && ids.length > max) { console.log(`capping this run at ${max} of ${ids.length} entries (--max 0 lifts the cap)`); ids = ids.slice(0, max); }

const avail = availability(verifier.vendor);
console.log(`verifier ${verifier.vendor}:${verifier.model} via ${avail.via ?? `none (${avail.why})`} · drafter ${drafter.vendor}:${drafter.model} · as of ${asOf} · ${dryRun ? "DRY RUN" : "writing"}`);

let heldCount = 0, publishedCount = 0, skipped = 0, failed = 0;
for (const id of ids) {
  console.log(`\n${id}`);
  try {
    const r = await runGate(id, { drafter, verifier, date, dryRun, force });
    if (r.skipped) skipped++; else if (r.adjudication.result === "held") heldCount++; else publishedCount++;
  } catch (err) {
    console.error(`  ERROR ${(err as Error).message}`);
    failed++;
  }
}
console.log(`\n${publishedCount} published · ${heldCount} held · ${skipped} skipped · ${failed} failed`);
process.exit(failed ? 1 : 0);
