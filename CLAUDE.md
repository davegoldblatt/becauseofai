# becauseofai.org — conventions for agent sessions

Read `HANDOFF.md` (the spec) and `README.md` (layout, decisions made) first. The weekly research prompt is `research/brief.md`.

## Two authorities over the data

- **Build and site work** never alters entry content. Numbers, dates, grades, and sources are editorial decisions. If a value looks wrong, add a line to the entry's `notes:` starting with `verify:` and leave the value.
- **The research run** (`research/brief.md`, Linear DAV-313) may propose evidence-backed edits to `data/entries/*.yaml`, each with a `history` line dated that day. A human merges. It never edits `data/seed-entries.yaml`, which is the import snapshot.

## Hard rules

- Do not add entries from a build session. Leads go to `research/inbox.md` with a link.
- Do not add scoring, ranking algorithms, sentiment, or AI-generated summaries. `rank` is set by a human.
- Do not add analytics, cookies, trackers, or third-party scripts beyond Google Fonts and Pagefind.
- No database, no CMS, no backend. YAML in git is the CMS and the git history is the audit trail.
- Keep dependencies minimal. No UI library, no Tailwind.

## How the data flows

`data/entries/*.yaml` → `src/schema.ts` (zod, build fails on a bad entry) → `src/lib/entries.ts` (parse, cross-file checks, held entries) → `src/lib/site.ts` (the one import pages use) → pages. An entry with no `type: primary` source is held: validated, in `/api/entries.json`, listed under `held`, but not rendered, counted, or linked.

## Commands

- `npm run validate` prints errors, held entries, and stale-window warnings. Exit 1 only on errors.
- `npm run build` builds `dist/` and runs Pagefind over it.
- `npm run dev` for local work.

## Rendering rules worth re-reading

Three badges on every card, three hue families, each linking to `/method`. Achieved and Published side by side at the same weight. Absolute effect shown next to the relative one. `pre` window badges muted. Date states: a range, "ongoing since", "from X, end not yet verified", "by X, start not yet verified", or "benefit not yet demonstrated". Never invent precision the YAML does not have.
