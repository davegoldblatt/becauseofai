# becauseofai.org — conventions for agent sessions

Read `HANDOFF.md` (the spec) and `README.md` (layout, decisions made) first. The weekly research prompt is `research/brief.md`.

## Two authorities over the data

- **Build and site work** never alters entry content. Numbers, dates, grades, and sources are editorial decisions. If a value looks wrong, add a line to the entry's `notes:` starting with `verify:` and leave the value.
- **The research runs** (`research/brief.md` weekly, `research/scout-brief.md` daily) may add or change `data/entries/*.yaml`, each change with a `history` line dated that day. Their pull requests merge automatically after validate and build; the editor reviews afterwards. They never edit `data/seed-entries.yaml`, which is the import snapshot.

## Hard rules

- Do not add entries from a build session. Leads go to `research/inbox.md` with a link.
- Do not add scoring, ranking algorithms, sentiment, or AI-generated summaries. `rank` is set by a human.
- Do not add analytics, cookies, trackers, or third-party scripts beyond Google Fonts and Pagefind.
- No database, no CMS, no backend. YAML in git is the CMS and the git history is the audit trail.
- Keep dependencies minimal. No UI library, no Tailwind.

## How the data flows

`data/entries/*.yaml` → `src/schema.ts` (zod, build fails on a bad entry) → `src/lib/entries.ts` (parse, cross-file checks, held entries) → `src/lib/site.ts` (the one import pages use) → pages. An entry with no `type: primary` source is held: validated, in `/api/entries.json`, listed under `held`, but not rendered, counted, or linked.

## The daily scout

`scripts/scout.ts` is deterministic and never calls a model. The model step runs in `.github/workflows/scout.yml` under `research/scout-brief.md`: inbox lines, at most two drafted entries per day, never an edit to an existing entry, always a pull request, which the workflow merges itself when validate and build pass. Treat `.scout/` as scratch.

## Commands

- `npm run validate` prints errors, held entries, and stale-window warnings. Exit 1 only on errors.
- `npm run build` builds `dist/` and runs Pagefind over it.
- `npm run dev` for local work.
- `npm run scout` pulls candidates for the last two days into `.scout/candidates.json` (`--days N` to widen).

## Rendering rules worth re-reading

Three stamps on every row and entry (evidence filled, attribution outlined, window in signal or hatched for `pre`), each linking to `/method` and carrying the same one-sentence definition as a tooltip; the definitions live in `GRADE_DESCRIPTION` in `src/lib/format.ts` and nowhere else. An entry with no grades shows one WATCHLIST stamp. The lag bar draws achieved and published on one shared axis and hatches the gap when it is six months or more (`lagFor` in `src/lib/format.ts` is the one place that rule lives). Achieved and Published appear as text on the entry page at the same weight; the absolute effect sits next to the relative one there. Date states: a range, "ongoing since", "from X, end not yet verified", "by X, start not yet verified", or "benefit not yet demonstrated". Not-because rows carry a null-red left rule; not-yet rows use dotted rules and `what_would_change` as their body. An entry whose latest history note ends with "unreviewed." shows an UNREVIEWED stamp until a later history line exists. Never invent precision the YAML does not have.

History notes: start with the change verb (`Added.`, `Upgraded evidence to A after …`, `Downgraded …`, `Corrected …`, `Verified …`, `Updated …`, `Removed …`, `Re-graded …`) or a bracketed prefix such as `[downgraded]`. The changelog and `/changes.xml` read the type from that word; any other note carries no type.
