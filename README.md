# becauseofai.org

A public registry of measured AI benefits to people. Every entry is one sentence that starts "Because of AI, …" and has to earn it with a primary source, a comparison, an achieved date (not a publication date), and three grades. The site also publishes what did not work (`not-because`) and what is not yet proven (`not-yet`).

The data is the product. The website is a reader for it. The data is YAML in git, the git history is the audit trail, and there is no database, CMS, or backend.

New entries are posted on X as [@bcuz_of_ai](https://x.com/bcuz_of_ai). The editor is [@davegoldblatt](https://x.com/davegoldblatt).

## What an entry has to pass

Every entry must pass four tests:

1. The benefit reached actual people.
2. It was measured against something: a control arm, a baseline, a comparison period.
3. The AI did something that would not otherwise have happened.
4. We know when the benefit happened, as opposed to when it was written up.

Each entry then carries three grades, shown as three stamps and never collapsed into one score:

- **evidence**: `A` randomized · `B` large observational · `C` operational report · `D` single case
- **attribution**: `isolated` · `only-path` · `bundled` · `ai-vs-ai`
- **window**: `in` · `ongoing` · `pre` (relative to the 12 months ending on the site's reference date)

An entry with no `primary` source is held: it validates, appears in the JSON feed under `held`, and is listed on `/changelog` under "Awaiting review", but it does not render, is not counted, and is never linked from reader pages. The full vocabulary is in `HANDOFF.md` §3 and on `/method`.

## Layout

- `data/entries/<id>.yaml`: the maintained registry, one file per entry. This is what the site reads.
- `data/seed-entries.yaml`: the original import snapshot (2026-10-22). Never edited after import.
- `src/schema.ts`: the zod schema. The build fails when an entry violates it.
- `src/lib/entries.ts`: the loader. Exposes `all` (every entry) and `publishable` (entries with a primary source). `src/lib/site.ts` is the one import pages use.
- `src/pages/`, `src/components/`, `src/layouts/`: the Astro site. `src/og/`: the share-image renderer.
- `research/`: the editorial prompts (`brief.md` weekly, `scout-brief.md` daily), the lead inbox, and the last run's note.
- `scripts/validate.ts`: `npm run validate`. `scripts/scout.ts`: `npm run scout`. `scripts/announce.ts`: posts new entries to social accounts.
- `.github/workflows/`: `ci.yml` (validate and build on every push and pull request), `scout.yml` (daily), `editor.yml` (weekly), `announce.yml` (after each merge that adds an entry).
- `HANDOFF.md`: the original build spec. `CLAUDE.md`: conventions for automated and agent sessions.

## Pages

`/` (because), `/not-because-of-ai`, `/not-yet`, `/entry/<id>`, `/method`, `/changelog`, `/about`, `/search` (Pagefind, built at deploy time), and a real `404.html` so unknown paths do not answer with the home page. Feeds and data: `/feed.xml` (one item per entry), `/changes.xml` (one item per history line), `/api/entries.json` (every entry, with `held` and `unreviewed` lists), `/api/schema.json` (JSON Schema generated from the zod schema), `/llms.txt` (a plain-text index for agents, built from the same data), `/.well-known/api-catalog` (RFC 9727, advertised by a `Link` header on `/` via `public/_headers`), `/sitemap.xml`. `robots.txt` allows everything and carries Content Signals (`search`, `ai-input`, `ai-train` all `yes`, matching the CC BY 4.0 license). Share images: `/og/<id>.png` per entry plus one per section.

## Add an entry

1. Copy an existing file in `data/entries/` to `data/entries/<new-id>.yaml`. The id is a kebab-case slug and must equal the filename.
2. Fill every field. Dates stay as written: `YYYY-MM-DD`, `YYYY-MM`, or a bare year. Never a publication date in `achieved_*`.
3. At least one source must be `type: primary`. Without one the entry is held: it validates but does not render.
4. Add a `history` line dated today. Start the note with the change verb (`Added.`, `Corrected …`, `Upgraded evidence to A after …`); the changelog reads the type from that word.
5. Run `npm run validate`, then `npm run build`.

## Validate, build, develop

```sh
npm install
npm run validate   # prints errors, held entries, and stale-window warnings; exit 1 only on errors
npm run build      # builds dist/ and runs Pagefind over it
npm run dev        # local server
```

`validate` exit code 1 means an entry is invalid and the build would fail. Held entries and stale-window warnings print but do not fail the run.

## The daily scout and the weekly editor

Two scheduled workflows maintain the registry between human edits. Both run Claude Code through the official GitHub Action and need one repository secret, `CLAUDE_CODE_OAUTH_TOKEN`, made with `claude setup-token` on a Pro or Max account.

**Daily scout** (`scout.yml`, every morning). `npm run scout` first pulls the last two days of candidates (PubMed, medRxiv, ClinicalTrials.gov results postings, four journal feeds) and alerts (Crossref retractions on our sources, stale window grades) into `.scout/candidates.json` with no model involved. The model then triages them against `research/scout-brief.md`, appends leads to `research/inbox.md`, reads the strongest one or two leads in full, drafts at most two entries when the bar is already met, and opens a pull request. The workflow merges that pull request itself once validate and build pass, so a drafted entry goes live the same morning carrying an UNREVIEWED stamp. A human reviews afterwards; a later history line clears the stamp.

**Weekly editor** (`editor.yml`, Sundays). Runs the full brief in `research/brief.md` with a stronger model: deep-verifies the strongest candidates against primary sources, reviews existing entries for follow-ups, retractions, and grades worth arguing with, rewrites `research/last-run.md`, and opens its own pull request, which the workflow also merges once validate and build pass. It can be dispatched by hand with an extra scope line for that run only.

**Announce** (`announce.yml`). After a merge that adds an entry, posts the entry to the site's social accounts once its page is live. Each network is skipped until its secrets exist.

Automated runs may add or change `data/entries/*.yaml`, each change with a dated `history` line. They never edit `data/seed-entries.yaml`. Build and site work never alters entry content; a value that looks wrong gets a `verify:` line in the entry's `notes:` instead.

## Deploy

Cloudflare Pages, static output. Build command `npm run build`, output directory `dist`. Every push to `main` deploys production; every other branch gets a preview at `<branch>.becauseofai.pages.dev` (previews send `noindex`). The custom domain is set on the Pages project and DNS is on Cloudflare.

## Decisions made

Defaults taken while building, with the reasons, so the next person does not re-derive them. The owner can override any of them with a pull request.

1. **Entries with no primary source are held, not fatal.** `validate` prints `held: needs primary source` and exits 0. Held entries do not render, are not counted, and are never linked from reader pages. `npm run validate` lists them.
2. **Grades are nullable for `not-yet` entries** (they have not been graded) and required for `because` and `not-because`. `window` may be null on any entry only when `notes` carries a `verify:` line.
3. **Press releases typed `primary` were imported as the seed had them.** Build work never alters sources. The editorial runs replace them with the paper or registry record, or hold the entry until one exists.
4. **The schema does not enforce "impact ≤ 6 words" or the exact "Because of AI, " prefix.** Several seed impacts run longer and two headlines start differently. Enforcing either would fail validation on content the build may not edit.
5. **Dates are never coerced to Date objects.** `2025-10-25` stays a string, `2025-10` stays, bare years (`2019`) stay numbers. This prevents a time-zone shift from moving a day.
6. **Stale window grades warn, never change.** `validate` warns when a `window: in` or `ongoing` grade no longer matches the achieved dates against the 12-month window ending on the reference date in `src/site.ts`, which is refreshed only through a reviewed change.
7. **`rank` must be unique within a section.** Duplicate ranks make the editorial order ambiguous and fail validation.
8. **Fonts are self-hosted** (`public/fonts/`, OFL, Latin subsets, static instances) instead of loaded from Google Fonts: no third-party request on page load, and Lighthouse performance stays above 95 on a throttled phone. The faces are Archivo (condensed 900 for numbers and the nameplate, 400 for body), Bricolage Grotesque 700 for the sentences, and JetBrains Mono 500 for dates, grades, and counts. This is a deliberate departure from the serif headline face in the original spec; tabular numerals stay on everywhere a number appears. The favicon (`public/favicon.svg`, with `favicon.ico` and `apple-touch-icon.png` for Safari and link unfurlers) is "AI" in the same condensed instance, converted to paths so it needs no font.
9. **Hosting is Cloudflare Pages. No newsletter.** The funding line on `/about` reads "independent, unfunded." `pre` entries show on `/` with a hatched window stamp. Share images are an ink card with the number in signal orange.
10. **The list pages are ledger rows, not cards.** A row carries the sentence, three stamps, the lag bar, one line of caveat, and the impact number; the summary, effect, comparison, reach, sources, and updated stamp live on the entry page only. Not-because rows carry a null-red left rule. Grades, the four tests, held entries, and "never invent precision" are unchanged from the spec.
11. **The lag bar shows a gap when publication trails the benefit by six months or more.** The reference is the achieved end; when the end is unknown and the window is not `ongoing`, the start; an ongoing benefit with no end has no lag. Months are floored from the latest day the achieved date could mean to the earliest day the published date could mean, so the gap is never overstated; bare years render as "~".
12. **Changelog types come from the note's leading word or a bracketed prefix** (`Added.`, `[downgraded] …`): added, upgraded, downgraded, updated, corrected, verified, removed, re-graded. Any other note carries no type. `/changes.xml` carries one item per history line; `/feed.xml` stays one item per entry.
13. **Unreviewed entries are visible as such, and kept out of the poster spots.** An entry whose latest history note ends in "unreviewed." carries an UNREVIEWED stamp on rows, entry pages, table, search, and share images, stays out of the hero, is left out of the tab counts and the share card, and is listed on `/changelog` under "Awaiting review" with the held entries. Publishing stays automatic; the stamp is the quarantine.
14. **The poster number can be set by hand.** Optional `impact_number` and `impact_label` on an entry drive the hero, rows, table, and share image; without them the number is parsed from `impact`. A leading modifier (~ ≈ + − $) is set at 45% size next to the number.

## License

Code is MIT. The registry data (`data/`, `research/`), the spec, and the site's written content are CC BY 4.0: reuse them with credit to "Because of AI (becauseofai.org)" and a link to the entry. Fonts (Archivo, Bricolage Grotesque, JetBrains Mono) are under the SIL Open Font License; their OFL texts sit next to the font files. See `LICENSE`.

## Contributing

Propose an entry or dispute one through the issue templates. Pull requests change one entry file at a time and add a `history` line. Every entry needs a primary source and an achieved date; see `HANDOFF.md` and `/method`. Build and design changes are welcome too; keep dependencies minimal (no UI library, no trackers, no analytics scripts in the code; the only third-party script is Cloudflare's cookieless measurement beacon, injected at the edge and allowed by the content-security policy in `public/_headers`).
