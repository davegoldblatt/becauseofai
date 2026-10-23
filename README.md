# becauseofai.org

A public registry of measured AI benefits to people. Every entry is a sentence that starts "Because of AI, …" and earns it with a primary source, a comparison, an achieved date (not a publication date), and three grades. The site also publishes what did not work (`not-because`) and what is not yet proven (`not-yet`).

The data is the product. The website is a reader for it. Read `HANDOFF.md` for the full spec and `research/brief.md` for the weekly editorial prompt.

## Layout

- `data/seed-entries.yaml`: the original import snapshot (2026-10-22). Never edited after import.
- `data/entries/<id>.yaml`: the maintained registry, one file per entry. This is what the site reads.
- `src/schema.ts`: the zod schema. The build fails when an entry violates it.
- `src/lib/entries.ts`: the loader. Exposes `all` (every entry) and `publishable` (entries with a primary source).
- `scripts/validate.ts`: `npm run validate`.
- `scripts/split-seed.py`: the one-time text split of the seed into per-entry files, with a deep-compare proof.

## Add an entry

1. Copy an existing file in `data/entries/` to `data/entries/<new-id>.yaml`. The id is a kebab-case slug and must equal the filename.
2. Fill every field. Dates stay as written: `YYYY-MM-DD`, `YYYY-MM`, or a bare year. Never a publication date in `achieved_*`.
3. At least one source must be `type: primary`. Without one the entry is held: it validates but does not render.
4. Add a `history` line dated today.
5. Run `npm run validate`, then `npm run build`.

## Run validate

```sh
npm install
npm run validate
```

Exit code 1 means an entry is invalid and the build would fail. Held entries and stale-window warnings print but do not fail the run.

## Daily scout

`npm run scout` pulls yesterday's candidates (PubMed, medRxiv, ClinicalTrials.gov results postings, four journal feeds) and alerts (Crossref retractions on our sources, stale window grades) into `.scout/candidates.json`, no model involved. The workflow `.github/workflows/scout.yml` runs it every morning, then lets Claude triage against `research/scout-brief.md`, append leads to `research/inbox.md`, draft at most two entries, and open a pull request. The pull request merges itself once validate and build pass (Dave, 2026-10-22: auto-merge), so drafted entries go live the same morning marked unreviewed; the editor reviews after the fact. A second workflow, `.github/workflows/editor.yml`, runs the full weekly brief (`research/brief.md`) every Sunday with a stronger model and opens its own pull request. Both need one repository secret, `CLAUDE_CODE_OAUTH_TOKEN`, made with `claude setup-token` on a Pro or Max account.

## Deploy

Cloudflare Pages, static output. Build command `npm run build`, output directory `dist`. See the Linear ticket DAV-310 for the preview and cutover steps.

## Decisions made

Defaults taken on the owner's behalf while building. Each is recorded on Linear ticket DAV-302 (decisions) or DAV-312 (owner decisions from HANDOFF §9), where the owner confirms or overrides.

1. **Entries with no primary source are held, not fatal.** `validate` prints `held: needs primary source` and exits 0. Held entries do not render, are not counted in the counts line, and are never linked from reader pages. Today that is two entries, not one: `maryland-ai-tutor-negative` (only a secondary summary of EdWorkingPaper 26-1598) and `gb-0895-phase-3` (only a secondary tracker). The computed counts line therefore reads 16 because · 3 not because · 4 not yet until the first research run finds the primaries.
2. **Grades are nullable for `not-yet` entries** (they have not been graded) and required for `because` and `not-because`. `window` may be null on any entry only when `notes` carries a `verify:` line (`china-ai-cal-null`).
3. **Press releases typed `primary` stay as the seed has them.** The build agent may not alter sources. The first research run (DAV-313) must replace them with the papers or withhold the claim.
4. **The schema does not enforce "impact ≤ 6 words" or the exact "Because of AI, " prefix.** Four seed impacts run seven words and two headlines start differently. Enforcing either would fail validation on content the build may not edit.
5. **Dates are never coerced to Date objects.** `2025-10-25` stays a string, `2025-10` stays, bare years (`2019`) stay numbers. This prevents a time-zone shift from moving a day.
6. **Stale window grades warn, never change.** `validate` warns when a `window: in` or `ongoing` grade no longer matches the achieved dates against the 12-month window ending today. `hurricane-melissa-2025` trips this on 2026-10-29.
7. **`rank` must be unique within a section.** Duplicate ranks make the editorial order ambiguous and fail validation.
8. **Fonts are self-hosted** (`public/fonts/`, OFL, Latin subsets, static instances) instead of loaded from Google Fonts: no third-party request on page load, and Lighthouse performance stays above 95 on a throttled phone. The faces are Archivo (condensed 900 for numbers and the nameplate, 400 for body), Bricolage Grotesque 700 for the sentences, and JetBrains Mono 500 for dates, grades, and counts. This departs from HANDOFF §5 (a serif headline face) by decision on DAV-326; tabular numerals stay on everywhere a number appears. The favicon (`public/favicon.svg`, with `favicon.ico` and `apple-touch-icon.png` for Safari and unfurlers) is "AI" in the same condensed instance, converted to paths so it needs no font; the X avatar in the same family lives outside the repo.
9. Hosting: Cloudflare Pages. No newsletter (Dave, 2026-10-22). `/about` funding line: "independent, unfunded." `pre` entries show on `/` with a hatched window stamp. OG images: ink card with the number in signal (DAV-341). (HANDOFF §9 defaults; DAV-312.)
10. **The list pages are ledger rows, not the HANDOFF §5 card** (DAV-326, Dave 2026-10-22). A row carries the sentence, three stamps, the lag bar, one line of caveat, and the impact number; the summary, effect, comparison, reach, sources, and updated stamp live on the entry page only. Not-because rows carry a null-red left rule. Grades, the four tests, held entries, and "never invent precision" are unchanged.
11. **The lag bar shows a gap when publication trails the benefit by six months or more.** The reference is the achieved end; when the end is unknown and the window is not `ongoing`, the start; an ongoing benefit with no end has no lag. Months are floored from the latest day the achieved date could mean to the earliest day the published date could mean, so the gap is never overstated; bare years render as "~".
12. **Changelog types come from the note's leading word or a bracketed prefix** (`Added.`, `[downgraded] …`): added, upgraded, downgraded, updated, corrected, verified, removed, re-graded. Any other note carries no type. `/changes.xml` carries one item per history line; `/feed.xml` stays one item per entry.
13. **Unreviewed entries are visible as such, and quarantined from the poster spots.** An entry whose latest history note ends in "unreviewed." carries an UNREVIEWED stamp on rows, entry pages, table, search, and share images, stays out of the hero, is left out of the tab counts and the share card (the running head says "N unreviewed"), and is listed on `/changelog` under "Awaiting review" with the held entries. Publishing stays automatic (Dave, 2026-10-22, DAV-366).
14. **The poster number can be set by hand.** Optional `impact_number` and `impact_label` on an entry drive the hero, rows, table, and share image; without them the number is parsed from `impact`. A leading modifier (~ ≈ + − $) is set at 45% size next to the number (DAV-368).

## License

Code is MIT. The registry data (`data/`, `research/`), the handoff, and the site's written content are CC BY 4.0: reuse them with credit to "Because of AI (becauseofai.org)" and a link to the entry. Fonts (Archivo, Bricolage Grotesque, JetBrains Mono) are under the SIL Open Font License; their OFL texts sit next to the font files. See `LICENSE`.

## Contributing

Propose an entry or dispute one through the issue templates. Pull requests change one entry file at a time and add a `history` line. Every entry needs a primary source and an achieved date; see `HANDOFF.md` and `/method`.
