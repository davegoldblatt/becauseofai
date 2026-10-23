// The drafter's receipts pass (DAV-376): for an entry that exists already, the
// drafter vendor reads the primary source text (fetched by code) and writes one
// verbatim receipt per numeric field, plus the attribution rationale. Values
// are never changed. A quote the code cannot find in the text is dropped, so
// the gate holds the entry rather than carrying an invented receipt.
//
//   node scripts/receipts.ts --entry <id>[,<id>] | --all | --missing
//   options: --dry-run  --max N (0 = no cap)
import { ReceiptsDraftSchema, jsonSchema, drafterSystem, drafterUser, requiredFieldsOf } from "./lib/verdict.ts";
import { callStructured, availability } from "./lib/vendors.ts";
import { loadVendorConfig, readDraft, allEntryIds, fetchPrimaries, sourcesForPrompt, writeOwned, fmtTokens, type DraftEntry } from "./lib/pipeline.ts";
import { findQuote } from "./lib/source-text.ts";
import { wordCount, RECEIPT_MAX_WORDS, missingReceipts } from "../src/schema.ts";

const argv = process.argv.slice(2);
const opt = (name: string): string | null => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const flag = (name: string) => argv.includes(name);

const cfg = loadVendorConfig();
const drafter = cfg.drafter;
const dryRun = flag("--dry-run");
const max = opt("--max") !== null ? Number(opt("--max")) : cfg.max_entries_per_run;

let ids: string[];
if (flag("--all")) ids = allEntryIds();
else if (flag("--missing")) ids = allEntryIds().filter((id) => { try { return missingReceipts(readDraft(id).entry).length > 0; } catch { return true; } });
else if (opt("--entry")) ids = opt("--entry")!.split(",").map((s) => s.trim()).filter(Boolean);
else { console.error("usage: receipts.ts --entry a,b | --all | --missing"); process.exit(1); }
if (!ids.length) { console.log("nothing to do"); process.exit(0); }
if (max > 0 && ids.length > max) { console.log(`capping this run at ${max} of ${ids.length} entries (--max 0 lifts the cap)`); ids = ids.slice(0, max); }

const avail = availability(drafter.vendor);
if (!avail.via) { console.error(`drafter ${drafter.vendor} unavailable: ${avail.why}`); process.exit(1); }
console.log(`drafter ${drafter.vendor}:${drafter.model} via ${avail.via} · ${dryRun ? "DRY RUN" : "writing"}`);
const schema = jsonSchema(ReceiptsDraftSchema);
let wrote = 0, failed = 0;

for (const id of ids) {
  let d: DraftEntry;
  try { d = readDraft(id); } catch (err) { console.error(`${id}: ${(err as Error).message}`); failed++; continue; }
  const e = d.entry;
  const required = requiredFieldsOf(e);
  console.log(`\n${id}: ${required.length} required field(s): ${required.join(", ")}`);
  const fetched = await fetchPrimaries(e, console.log);
  if (!fetched.texts.size) { console.log("  no primary source could be read; nothing to write (the gate will hold it)"); failed++; continue; }
  const sources = sourcesForPrompt(fetched);
  const user = drafterUser({ entryId: id, entryYaml: d.content.replace(/^(notes|history):[\s\S]*?(?=^[a-z_]+:|\Z)/gm, ""), required, sources });
  const r = await callStructured(drafter.vendor, { system: drafterSystem(), user, schema, schemaName: "receipts", validate: ReceiptsDraftSchema, model: drafter.model, effort: drafter.effort });
  if (!r.ok) { console.log(`  drafter FAILED: ${r.error}`); failed++; continue; }
  console.log(`  drafter answered · ${fmtTokens(r.tokens)} · ${Math.round(r.durationMs / 1000)} s`);
  const kept = [];
  for (const rc of r.output.receipts) {
    const t = fetched.texts.get(rc.source);
    const words = wordCount(rc.quote);
    const found = t ? findQuote(t.text, rc.quote).found : false;
    if (!t || !found || words > RECEIPT_MAX_WORDS || !rc.quote.trim() || !rc.locator.trim()) {
      console.log(`  dropped receipt for ${rc.field}: ${!t ? `source ${rc.source} not read` : !found ? "quote not found verbatim" : words > RECEIPT_MAX_WORDS ? `${words} words` : "blank"}: "${rc.quote.slice(0, 80)}"`);
      continue;
    }
    kept.push({ field: rc.field, quote: rc.quote.trim(), locator: rc.locator.trim(), source: rc.source });
  }
  for (const u of r.output.unsupported) console.log(`  drafter could not support ${u.field}: ${u.why}`);
  const covered = new Set(kept.map((k) => k.field));
  const missing = required.filter((f) => !covered.has(f));
  console.log(`  ${kept.length} receipt(s) kept${missing.length ? `; still missing ${missing.join(", ")}` : "; every required field covered"}`);
  if (dryRun) { for (const k of kept) console.log(`    ${k.field} <- "${k.quote}" (${k.locator}, source ${k.source})`); continue; }
  writeOwned(d, { receipts: kept, rationale: r.output.rationale.trim() || undefined });
  wrote++;
}
console.log(`\n${wrote} entries written · ${failed} not written`);
process.exit(0);
