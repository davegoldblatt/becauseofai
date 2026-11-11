# becauseofai.org — conventions for agent sessions

Read `HANDOFF.md` (the spec) and `README.md` (layout, decisions made) first. The weekly research prompt is `research/brief.md`.

## Two authorities over the data

- **Build and site work** never alters entry content. Numbers, dates, grades, and sources are editorial decisions. If a value looks wrong, add a line to the entry's `notes:` starting with `verify:` and leave the value.
- **The research runs** (`research/brief.md` weekly, `research/scout-brief.md` daily) may add or change `data/entries/*.yaml`, each change with a `history` line dated that day and a receipt for every number. Their pull requests go through the gate (`scripts/verify.ts`: a second vendor checks every receipt and grade against the source text) and merge automatically after validate and build. No human reviews entries. They never edit `data/seed-entries.yaml`, which is the import snapshot.
- **The pipeline's own keys** at the end of each entry file, `rationale`, `receipts`, `verification`, and `held`, are written by `scripts/receipts.ts`, `scripts/verify.ts`, and `scripts/dispute.ts` through `scripts/lib/yaml-edit.ts`, which rewrites only those blocks. Never hand-edit `verification` or `held`; run the gate. The public record of every run is `data/verifications/<id>/<date>.json`.

## Hard rules

- Do not add entries from a build session. Leads go to `research/inbox.md` with a link.
- Do not add scoring, ranking algorithms, sentiment, or AI-generated summaries. `rank` is set by a human.
- Do not add analytics, cookies, trackers, or third-party scripts beyond Pagefind. The one exception is Cloudflare's cookieless measurement beacon, which Cloudflare injects at the edge (no code in this repo) and the owner chose to keep on 2026-10-23; the content-security policy in `public/_headers` allows exactly that host and nothing else.
- No database, no CMS, no backend. YAML in git is the CMS and the git history is the audit trail.
- Keep dependencies minimal. No UI library, no Tailwind.

## How the data flows

`data/entries/*.yaml` → `src/schema.ts` (zod, build fails on a bad entry) → `src/lib/entries.ts` (parse, cross-file checks, held entries) → `src/lib/site.ts` (the one import pages use) → pages. An entry is published only with a passing `verification` whose drafter and verifier are different vendors, a receipt on every numeric field, no `held` block, and a `type: primary` source; anything else is held: validated, in `/api/entries.json` under `held` with its reason, listed on `/changelog#held`, but not rendered, counted, or linked.

How sure (DAV-469, 2026-11-09): a published entry is **strict**, **reasonable**, or **speculative**. Code decides it in `scripts/lib/adjudicate.ts` from the verifier's structured findings (a source read only in part, dates from an abstract or press release, a press-release or news source, no comparison or no date); it is written to `verification.confidence` with the reasons in `verification.relaxed`, and the loader checks it against the bound record. Every list starts on strict; `levelOf()` in `src/lib/site.ts` is the one accessor. The running head, hero, home and section share images, page descriptions, and the X announcer are strict only. An entry with no bound verification publishes only if it is in `src/lib/legacy.ts` (frozen); otherwise it is held until the gate runs.

## The daily scout

`scripts/scout.ts` is deterministic and never calls a model. The model step runs in `.github/workflows/scout.yml` under `research/scout-brief.md`: inbox lines, at most eight drafted entries per day with receipts (at any level, DAV-469), never an edit to an existing entry, always a pull request. The gate then runs on the branch (`scripts/verify.ts --changed`), and the workflow merges when validate and build pass. Treat `.scout/` as scratch.

## The backfill (DAV-475)

`.github/workflows/backfill.yml` runs six times a day. `scripts/backfill-slice.ts` is the plan: 105 fixed slices of the past twelve months (five parts of the inbox, twelve sectors of announcements in four quarters, fifty-two weeks of papers). A run takes the next slice that has no heading in `research/backfill-log.md` (a failed run leaves none, so its slice comes round again; when all have one, the runs stop calling a model), the model drafts at most eight entries under `research/backfill-brief.md` (announcements by web search, then `npm run read` on the organisation's own page), writes the log, and the same gate decides. A source marked `announcement: true`, or one on a press-release wire, caps the entry at speculative in code (`scripts/lib/adjudicate.ts`), whatever the verifier calls the page. The gate job merges only this repository's own pull request at the exact commit it verified, and merges nothing when the verifier was unavailable. To pause the backfill, disable the workflow; nothing depends on it. `scripts/scout.ts --until YYYY-MM-DD` pulls a past window (PubMed, medRxiv, ClinicalTrials.gov only); without it the scout also pulls announcements (`kind: "announcement"`). The reader falls back to the Europe PMC abstract when a paper cannot be read (method `europepmc-abstract`, always partial, so reasonable at best). A rank tie within a section is a warning and is broken by id.

## The gate

`scripts/lib/source-text.ts` fetches a primary source in full with no model (ClinicalTrials.gov API, Europe PMC full text, HTML, PDF via `pdftotext`) and finds each receipt's quote in the text. `scripts/lib/vendors.ts` makes one structured call per vendor (API key or the vendor's CLI login), in an empty directory with no tools. `scripts/lib/adjudicate.ts` is the only thing that decides published or held, and the fixtures in `tests/adjudicate.test.ts` are its contract. `research/vendors.json` names the roles; the code refuses to run with the same vendor on both sides, and the schema refuses to publish such an entry.

## Commands

- `npm test` runs the gate's fixtures and the schema and text-helper tests.
- `npm run validate` prints errors, held entries with their reason, and stale-window warnings. Exit 1 only on errors.
- `node scripts/verify.ts --entry <id> [--dry-run]` runs the gate; `node scripts/receipts.ts --entry <id>` has the drafter write receipts; `node scripts/dispute.ts --issue <n>` handles a dispute.
- `npm run build` builds `dist/` and runs Pagefind over it.
- `npm run dev` for local work.
- `npm run scout` pulls candidates for the last two days into `.scout/candidates.json` (`--days N` to widen).

## Rendering rules worth re-reading

Three stamps on every row and entry (evidence filled, attribution outlined, window in signal or hatched for `pre`), each linking to `/method` and carrying the same one-sentence definition as a tooltip; the definitions live in `GRADE_DESCRIPTION` in `src/lib/format.ts` and nowhere else. An entry with no grades shows one WATCHLIST stamp. The lag bar draws achieved and published on one shared axis and hatches the gap when it is six months or more (`lagFor` in `src/lib/format.ts` is the one place that rule lives). Achieved and Published appear as text on the entry page at the same weight; the absolute effect sits next to the relative one there. Date states: a range, "ongoing since", "from X, end not yet verified", "by X, start not yet verified", or "benefit not yet demonstrated". Not-because rows carry a null-red left rule; not-yet rows use dotted rules and `what_would_change` as their body. On the entry page every receipted number carries a receipt mark (quote, locator, source) and a Verification block names both models and links the record. The running head shows "Held N" linking to `/changelog#held`. Never invent precision the YAML does not have.

History notes: start with the change verb (`Added.`, `Upgraded evidence to A after …`, `Downgraded …`, `Corrected …`, `Verified …`, `Updated …`, `Removed …`, `Re-graded …`) or a bracketed prefix such as `[downgraded]`. The changelog and `/changes.xml` read the type from that word; any other note carries no type.
