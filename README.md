# becauseofai.org

A public registry of measured AI benefits to people. Every entry is one sentence that starts "Because of AI, …" and has to earn it with a primary source, a comparison, an achieved date (not a publication date), and three grades. The site also publishes what did not work (`not-because`) and what is not yet proven (`not-yet`).

The data is the product. The website is a reader for it. The data is YAML in git, the git history is the audit trail, and there is no database, CMS, or backend.

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

Every number on a published entry carries a **receipt**: the verbatim sentence in the primary source that supports it. An entry is either **published** (a model from one vendor drafted it and a model from a different vendor independently agreed on every receipt and every grade) or **held**, with a public reason. Held entries validate, appear in the JSON feed under `held`, and are listed on `/changelog#held` with both verdicts, but do not render, are not counted, and are never linked. The full vocabulary is in `HANDOFF.md` §3 and on `/method`.

## Layout

- `data/entries/<id>.yaml`: the maintained registry, one file per entry. This is what the site reads.
- `data/seed-entries.yaml`: the original import snapshot (2026-10-22). Never edited after import.
- `data/verifications/<id>/<date>.json`: the public record of every verification and dispute run: what was fetched, which quotes were found, the verifier's full output, and the decision.
- `src/schema.ts`: the zod schema. The build fails when an entry violates it, including a published entry missing a receipt or verified by one vendor.
- `src/lib/entries.ts`: the loader. Exposes `all` (every entry) and `publishable` (entries with a passing cross-vendor verification and a primary source). `src/lib/site.ts` is the one import pages use.
- `src/pages/`, `src/components/`, `src/layouts/`: the Astro site. `src/og/`: the share-image renderer.
- `research/`: the editorial prompts (`brief.md` weekly, `scout-brief.md` daily), `vendors.json` (which vendor drafts and which verifies), the lead inbox, and the last run's note.
- `scripts/validate.ts`: `npm run validate`. `scripts/scout.ts`: `npm run scout`. `scripts/verify.ts`: the gate. `scripts/receipts.ts`: the drafter's receipts for an existing entry. `scripts/dispute.ts`: a reader's dispute. `scripts/announce.ts`: posts published entries to social accounts. `scripts/lib/`: the source reader, the vendor adapters, the adjudicator.
- `tests/`: `npm test`. The gate's fixtures: six cases that must hold, one that must publish.
- `.github/workflows/`: `ci.yml` (test, validate and build on every push and pull request), `scout.yml` (daily), `editor.yml` (weekly), `verify.yml` (the gate by hand, and disputes), `announce.yml` (after each merge that adds or publishes an entry).
- `HANDOFF.md`: the original build spec. `CLAUDE.md`: conventions for automated and agent sessions.

## Pages

`/` (because), `/not-because-of-ai`, `/not-yet`, `/entry/<id>`, `/method`, `/changelog` (with the held list), `/about`, `/search` (Pagefind, built at deploy time). Feeds: `/feed.xml` (one item per entry), `/changes.xml` (one item per history line), `/api/entries.json` (every entry, with the `held` list and reasons), `/sitemap.xml`. Share images: `/og/<id>.png` per entry plus one per section.

## Add an entry

1. Copy an existing file in `data/entries/` to `data/entries/<new-id>.yaml`. The id is a kebab-case slug and must equal the filename.
2. Fill every field. Dates stay as written: `YYYY-MM-DD`, `YYYY-MM`, or a bare year. Never a publication date in `achieved_*`.
3. At least one source must be `type: primary`. Without one the entry is held: it validates but does not render.
4. Add a `history` line dated today. Start the note with the change verb (`Added.`, `Corrected …`, `Upgraded evidence to A after …`); the changelog reads the type from that word.
5. Add `receipts`: for every field that holds a number, the verbatim sentence (25 words or fewer) in a primary source that supports it, with a locator and the source index, plus a one-line `rationale` for the attribution grade. `node scripts/receipts.ts --entry <id>` has the drafter write them from the source text.
6. Run `npm run validate`, then `npm run build`. The entry is held until the gate has run: `node scripts/verify.ts --entry <id>` (needs the verifier vendor's login or key), or the `verify` workflow by hand.

## Validate, build, develop

```sh
npm install
npm run validate   # prints errors, held entries, and stale-window warnings; exit 1 only on errors
npm run build      # builds dist/ and runs Pagefind over it
npm run dev        # local server
```

`validate` exit code 1 means an entry is invalid and the build would fail. Held entries and stale-window warnings print but do not fail the run.

## The pipeline: no human in the loop

Nobody reviews entries. The editor writes the rules; the pipeline applies them; the public checks the work. Two scheduled workflows draft, one gate decides, and one workflow handles disputes.

**The gate** (`scripts/verify.ts`, run inside the scout and editor workflows and by hand through `verify.yml`). For each new or changed entry: code fetches every primary source in full (ClinicalTrials.gov API, Europe PMC full text for DOIs, HTML, PDF via `pdftotext`) and checks that every receipt's quote occurs in the text. A verifying model from the *other* vendor (`research/vendors.json`; default Anthropic drafts, OpenAI verifies) receives only the source text and the entry, never the drafter's reasoning, and returns a structured verdict: each receipt supported, contradicted, or unsupported; its own three grades; where the achieved dates come from; whether the text was the full document; whether the source shows a conflict the entry does not state; pass or fail on the four tests. Code decides: any receipt not supported, any grade disagreement, any failed test, an unstated conflict, a press release as the only primary, a source that could not be read in full, or a vendor that could not be reached, and the entry is **held** with that reason. Otherwise it is **published**. The full verdict is committed under `data/verifications/`, the entry carries a `verification` block naming both models, and the schema refuses to build a published entry whose drafter and verifier are the same vendor. There is no tiebreaker: two vendors, and they must agree.

**Secrets.** Anthropic: `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token` on a Pro or Max account) or `ANTHROPIC_API_KEY`. OpenAI: `OPENAI_API_KEY` (recommended by OpenAI for automation), or `CODEX_AUTH_JSON` (the contents of a Codex CLI login file; OpenAI advises against this on public repositories, and the file goes stale after about eight days unless written back). Without an OpenAI credential the gate holds every new entry as `verification-unavailable`: that is the rule, never publish on one vendor.

**Disputes** (`scripts/dispute.ts`, on the `dispute` label). Both vendors assess the dispute against the primary source and any source the reader linked. Both uphold: the entry is amended with the corrections they agree on, re-verified, and the issue closed. Both reject: the issue is closed with both reasonings. Otherwise the entry is held `disputed`, both verdicts are published, and the issue stays open.

**Daily scout** (`scout.yml`, every morning). `npm run scout` first pulls the last two days of candidates (PubMed, medRxiv, ClinicalTrials.gov results postings, four journal feeds) and alerts (Crossref retractions on our sources, stale window grades) into `.scout/candidates.json` with no model involved. The drafting model then triages them against `research/scout-brief.md`, appends leads to `research/inbox.md`, reads the strongest one or two leads in full, drafts at most two entries with receipts when the bar is already met, and opens a pull request. The gate runs on the branch, the workflow merges once validate and build pass, and a published entry goes live the same morning; a held one appears on the changelog with its reason.

**Weekly editor** (`editor.yml`, Sundays). Runs the full brief in `research/brief.md` with a stronger model: deep-verifies the strongest candidates against primary sources, reviews existing entries for follow-ups, retractions, and grades worth arguing with, rewrites `research/last-run.md`, and opens its own pull request. Every entry it changes goes back through the gate before the merge. It can be dispatched by hand with an extra scope line for that run only.

**Announce** (`announce.yml`). After a merge that adds or publishes an entry, posts the entry to the site's social accounts once its page is live. Held entries are never announced. Each network is skipped until its secrets exist.

Automated runs may add or change `data/entries/*.yaml`, each change with a dated `history` line. They never edit `data/seed-entries.yaml`. Build and site work never alters entry content; a value that looks wrong gets a `verify:` line in the entry's `notes:` instead.

## Deploy

Cloudflare Pages, static output. Build command `npm run build`, output directory `dist`. Every push to `main` deploys production; every other branch gets a preview at `<branch>.becauseofai.pages.dev` (previews send `noindex`). The custom domain is set on the Pages project and DNS is on Cloudflare.

## Decisions made

Defaults taken while building, with the reasons, so the next person does not re-derive them. The owner can override any of them with a pull request.

1. **Held entries are a state, not an error.** An entry with no primary source, no passing verification, or a `held` block is held: `validate` lists it with its reason and exits 0; it does not render, is not counted, and is never linked from reader pages. The reasons are a fixed vocabulary (`ungrounded`, `no-full-text`, `grade-split`, `fails-test`, `verification-unavailable`, `no-primary-source`, `disputed`) set only by the adjudicator in `scripts/lib/adjudicate.ts`.
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
13. **No human in the loop per entry; cross-vendor agreement and public receipts replace editor review** (DAV-376, supersedes the earlier "unreviewed" stamp). The editor writes the rules; a model from one vendor drafts; a model from a different vendor verifies from the source text alone; code adjudicates; disagreements are published on `/changelog#held`. Two vendors only (Anthropic and OpenAI), so there is no tiebreaker: any grade disagreement holds the entry, and a dispute is upheld or rejected only when both vendors say so, otherwise the entry is held as disputed. The conflict of interest (models grading an AI registry) is stated on `/method` rather than claimed away. `rationale`, `receipts`, `verification`, and `held` are the pipeline's own keys at the end of each entry file; the scripts rewrite only those and leave every other byte as written.
14. **The poster number can be set by hand.** Optional `impact_number` and `impact_label` on an entry drive the hero, rows, table, and share image; without them the number is parsed from `impact`. A leading modifier (~ ≈ + − $) is set at 45% size next to the number.

## License

Code is MIT. The registry data (`data/`, `research/`), the spec, and the site's written content are CC BY 4.0: reuse them with credit to "Because of AI (becauseofai.org)" and a link to the entry. Fonts (Archivo, Bricolage Grotesque, JetBrains Mono) are under the SIL Open Font License; their OFL texts sit next to the font files. See `LICENSE`.

## Contributing

Propose an entry or dispute one through the issue templates. Pull requests change one entry file at a time and add a `history` line. Every entry needs a primary source and an achieved date; see `HANDOFF.md` and `/method`. Build and design changes are welcome too; keep dependencies minimal (no UI library, no analytics, no trackers).
