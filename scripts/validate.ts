// `npm run validate`: validate every entry file, report held entries and stale
// window warnings, exit non-zero only on errors.
import { loadEntries, counts } from "../src/lib/entries.ts";

const r = loadEntries();
for (const p of r.errors) console.error(`ERROR  ${p.file}: ${p.message}`);
for (const p of r.warnings) console.warn(`WARN   ${p.file}: ${p.message}`);
for (const e of r.held) console.log(`held   ${e.id}.yaml: needs primary source (not rendered, not counted)`);
const c = counts(r.publishable);
console.log(
  `${r.all.length} entries read, ${r.publishable.length} publishable, ${r.held.length} held, ` +
    `${r.errors.length} error(s), ${r.warnings.length} warning(s)`,
);
console.log(`counts: ${c.because} because · ${c["not-because"]} not because · ${c["not-yet"]} not yet`);
process.exit(r.errors.length ? 1 : 0);
