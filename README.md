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
8. Hosting: Cloudflare Pages. Newsletter: Buttondown placeholder. `/about` funding line: "independent, unfunded." `pre` entries show on `/` with a muted window badge. OG images: plain text card. (HANDOFF §9 defaults; DAV-312.)
