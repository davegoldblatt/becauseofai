# Linear export — project framing and tickets (2026-10-22)

Project: becauseofai.org  
URL: https://linear.app/davegoldblatt/project/becauseofaiorg-2cf3bdeadbb1  
Description: Public registry of measured AI benefits to people. Static site, one YAML file per entry, three grades, a weekly research run that proposes PRs.

## Project content (the framing doc on the Linear project)

# [becauseofai.org](<http://becauseofai.org>)

A public registry of measured AI benefits to people. Every entry is one sentence that starts "Because of AI, …" and must earn it with a primary source, a comparison, an achieved date (not a publication date), and three grades. The site also publishes what did not work (not-because) and what is not yet proven (not-yet). The data is the product. The website is a reader for it.

## Source documents

The handoff package is three files on Dave's Desktop (2026-10-22). They move into the repo as follows:

* `HANDOFF (1).md` → `HANDOFF.md` (build spec: stack, data model, pages, design, build order, agent rules, Dave's decisions, definition of done)
* `brief.md` → `research/brief.md` (the standing weekly research prompt)
* `seed-entries.yaml` → `data/seed-entries.yaml` (25 entries: 16 because, 4 not-because, 5 not-yet)

## The four tests

Every entry must pass all four: the benefit reached actual humans, it was measured against something, the AI did something that would not otherwise have happened, and we know when the benefit occurred.

## Grades (three badges, never collapsed into one score)

* evidence: A randomized / B large observational / C operational report / D single case
* attribution: isolated / only-path / bundled / ai-vs-ai
* window: in / ongoing / pre (12-month window ending today)

## Stack

Astro static output, TypeScript, plain CSS with tokens. One YAML file per entry. zod validation at build. Pagefind search. No database, CMS, auth, backend, analytics, or trackers. Cloudflare Pages. Outputs: HTML, `/feed.xml`, `/api/entries.json`, `/sitemap.xml`, OG images last.

## Hard rules for any agent

Do not invent or alter content. Do not add entries (write leads to `research/inbox.md`). Do not add scoring or ranking algorithms. Do not add trackers. Keep dependencies minimal. When a decision is Dave's, take the default, note it in README under "Decisions made", and move on.

## Known day-one conflicts between the seed and the schema

1. `maryland-ai-tutor-negative` has only a secondary source. The spec says the build fails on any entry without a primary. The entry's own history line says it should not render until one is found.
2. The five not-yet entries and `china-ai-cal-null` carry null grades. The spec lists all three grades as required.
3. Several sources typed `primary` are press releases or news write-ups (EurekAlert for GOLDEN BRIDGE II, Muscat Daily for Oman, a trade-press page for the NICE DERM assessment). The brief says press releases are leads, not evidence.

Each has a ticket.

## Domain

`becauseofai.org` was registered at Namecheap on 2026-10-22 and sits on Namecheap default nameservers. Claude handles the DNS work through the browser.

## Tickets

### DAV-301 — Scaffold the site: Astro, zod schema, loader, split seed entries, validate passes

State: Todo · Priority: High · Labels: plumbing, backend  
Blocked by: nothing · Blocks: DAV-310, DAV-309, DAV-308, DAV-306, DAV-305, DAV-303

Build step 1 of 9 (HANDOFF §6).

## Do

* Create the repo. Copy the three handoff files in: `HANDOFF.md`, `research/brief.md`, `data/seed-entries.yaml`.
* Astro (static output), TypeScript, plain CSS with design tokens. No Tailwind. No UI library.
* `src/schema.ts` with zod. Required: `headline`, `summary`, `section`, `domain`, `grades.evidence`, `grades.attribution`, `grades.window`, `dates.published`, at least one `sources[]` item with `type: primary`. not-yet entries must have `what_would_change`.
* Loader that reads `data/entries/*.yaml`.
* Split `data/seed-entries.yaml` into `data/entries/<id>.yaml`, one file per entry, 25 files. Do not change any value.
* `npm run validate` runs the schema over every entry and must pass.

## Seed conflicts you will hit

The seed does not pass the spec's schema as written. Take the defaults in the "seed vs schema" ticket, note them in README under "Decisions made", and keep going. Do not edit grades, numbers, or sources. If a field looks wrong, add a `verify:` line to `notes:`.

## Done when

* 25 entry files exist and `npm run validate` passes.
* Commit with a plain message.

---

### DAV-302 — Decide the three seed-vs-schema conflicts (defaults applied, Dave confirms)

State: Todo · Priority: High · Labels: needs-dave, content  
Blocked by: nothing · Blocks: DAV-313

The seed data and the spec's schema disagree in three places. The build agent takes the defaults below and notes them in README. Dave confirms or overrides.

## 1. Entry with no primary source

`maryland-ai-tutor-negative` (not-because, rank 3) cites only a secondary summary of EdWorkingPaper 26-1598. Its history line says "needs primary source before it renders." The spec says the build fails on any entry without a primary source.

Default: `validate` holds the entry back instead of failing. It does not render and does not count in the counts line. `validate` prints it as `held: needs primary source`. The first research run locates the paper.

## 2. Null grades

All five not-yet entries have `evidence`, `attribution`, and `window` set to null. `china-ai-cal-null` has `window: null` with a `verify:` note on intervention dates. The spec says all three grades are required.

Default: grades are required for `because` and `not-because`, nullable for `not-yet`. `window` may be null on any entry when `notes` carries a `verify:` line. A null window renders as a muted "window: unverified" badge that links to `/method`.

## 3. Press releases typed as primary

* `golden-bridge-ii-stroke`: EurekAlert press release typed primary. The BMJ paper (2026;392:e085810) is the primary.
* `oman-ai-retinopathy`: Muscat Daily article typed primary. The Ministry of Health report, if one exists, is the primary.
* `nhs-derm-skin-cancer`: a trade-press page typed primary for the NICE early value assessment. The NICE document is the primary.
* `gb-0895-phase-3`: only a secondary tracker. The [ClinicalTrials.gov](<http://ClinicalTrials.gov>) SOLAIRIA-1 record is the primary (the entry's own `verify:` note says so).

Default: leave the seed as is (agent rule: do not alter sources). Add the swaps to the first research run's scope. The brief says press releases are leads, not evidence, so these entries would otherwise carry a primary badge they have not earned.

## Dave decides

Confirm the three defaults, or say what to do instead.

---

### DAV-303 — Card component, homepage with rank order and counts line, entry pages

State: Todo · Priority: High · Labels: ui  
Blocked by: DAV-301 · Blocks: DAV-311, DAV-307, DAV-304

Build step 2 of 9 (HANDOFF §6).

## Card (HANDOFF §5)

Headline (bold, the full "Because of AI, …" sentence) → impact badge → three grade badges → achieved / published → summary → caveat (smaller, muted) → primary source link → "updated" stamp.

## Rendering rules (HANDOFF §3)

* Three grade badges on every card. Three distinct hue families: evidence blue scale, attribution green/amber, window gray/teal. Each badge links to its definition on `/method`. Never collapse grades into one score.
* Every card and entry page shows `Achieved` and `Published` side by side at the same weight. If `achieved_end` is null, show "Achieved: ongoing since <start>".
* When `effect.absolute` exists, show it next to `effect.relative` on one line, for example "26% fewer (10 per 1,000)".
* `pre` entries get a visibly muted window badge.

## Homepage `/`

Thesis line: "Every entry here reached a human, was measured against something, and names the date it happened — not the date it was published." Then the filter bar (built in the next step, leave the slot) and the `because` list ordered by `rank`. Counts line: "16 because · 4 not because · 5 not yet", computed from the data.

## Entry page `/entry/[id]`

Headline, impact, badges, dates, summary, caveat, comparison, effect, reach, conflicts, what-would-change, sources (primary first), notes (muted "editor's notes" block, `verify:` lines stay visible), related, history. Canonical permalink. "Cite this entry" block with URL and updated date.

## Design (HANDOFF §5)

Serif headline face with good numerals (Newsreader or Source Serif 4 via Google Fonts). System sans body. Tabular numerals everywhere numbers appear. Warm off-white / near-black backgrounds, one muted accent. Badges are the only saturated color. No hero image, illustrations, company logos, testimonials, or counters.

## Done when

Every entry page shows Achieved and Published side by side. Every card shows three badges. No entry without a primary source renders.

---

### DAV-304 — Filters with URL params, plus the not-because and not-yet section pages

State: Todo · Priority: Normal · Labels: ui  
Blocked by: DAV-303 · Blocks: nothing

Build step 3 of 9 (HANDOFF §6).

## Filters

On `/`, `/not-because-of-ai`, and `/not-yet`: domain, evidence, attribution, window, ai_type. Client-side, driven by URL params so filtered views are shareable, for example `/?window=in&evidence=A`. Default view shows all windows, with `pre` entries muted.

## Section pages

* `/not-because-of-ai`: the `not-because` section, same card component, short intro on why nulls are here.
* `/not-yet`: the `not-yet` section. Each card shows `what_would_change` prominently.

## Done when

Filters change the URL and reload their state from it on page load.

---

### DAV-305 — /method, /about, and /changelog pages

State: Todo · Priority: Normal · Labels: content, ui  
Blocked by: DAV-301 · Blocks: nothing

Build step 4 of 9 (HANDOFF §6).

## `/method`

* The four tests.
* The grade vocabulary with one example each drawn from the live entries.
* The achieved-vs-published rule with GOLDEN BRIDGE II as the worked example (enrolled 2021 to 2023, published March 2026, window = pre).
* "Why we don't auto-score": describe the Truvace identical-sub-scores problem in words. No screenshot of their site.
* How to submit or dispute an entry (links to the GitHub issue templates).
* Every badge on the site links here. The page should read in under three minutes.

## `/changelog`

Generated from every entry's `history[]`, newest first, grouped by date.

## `/about`

Who runs it, funding (default "independent, unfunded"), conflicts policy, contact. Leave copy placeholders for Dave and list them in the Dave-decisions ticket.

---

### DAV-306 — RSS feed, JSON endpoint, sitemap, and Pagefind search

State: Todo · Priority: Normal · Labels: plumbing  
Blocked by: DAV-301 · Blocks: nothing

Build step 5 of 9 (HANDOFF §6).

* `/feed.xml`: RSS, newest `dates.added` first. Must validate.
* `/api/entries.json`: every entry with full fields.
* `/sitemap.xml`.
* Pagefind indexed at build time.
* No analytics by default. Leave a commented Plausible snippet.
* Newsletter: placeholder link to Buttondown.

## Done when

`/feed.xml` validates and `/api/entries.json` returns every entry with full fields.

---

### DAV-307 — Dark mode, responsive pass at 375 / 768 / 1280, Lighthouse 95 on all four

State: Todo · Priority: Normal · Labels: ui  
Blocked by: DAV-303 · Blocks: nothing

Build step 6 of 9 (HANDOFF §6).

* Dark mode via `prefers-color-scheme` plus a toggle.
* Mobile-first. 16px side gutters. No horizontal scroll at 375px. Cards readable, badges wrap.
* Check 375, 768, and 1280.
* Lighthouse ≥ 95 on all four categories for `/` and one entry page. Record the scores in the ticket.

---

### DAV-308 — GitHub issue templates, PR template, and CI that runs validate and build

State: Todo · Priority: Normal · Labels: plumbing  
Blocked by: DAV-301 · Blocks: DAV-313

Build step 7 of 9 (HANDOFF §6).

* `.github/ISSUE_TEMPLATE/`: submit an entry, dispute an entry. These are the only submission and dispute paths. No forms on the site.
* PR template: "one entry file + history line; link primary source."
* CI on every PR and push: `npm run validate` then `npm run build`.

This is what makes the weekly research run mergeable: the research model opens a PR, CI validates it, a human merges.

---

### DAV-309 — README, CLAUDE.md, research folder placeholders, deploy config

State: Todo · Priority: Normal · Labels: content, plumbing  
Blocked by: DAV-301 · Blocks: DAV-313

Build step 8 of 9 (HANDOFF §6 and §8).

## README.md

How to add an entry. How to run validate. How to deploy. A "Decisions made" section listing every default taken on Dave's behalf (see the Dave-decisions ticket and the seed-vs-schema ticket).

## CLAUDE.md

Conventions for future sessions: data is YAML in git, never alter content, never auto-score, how validate works, the `history` line convention, where research files live.

## research/

* `research/brief.md` (the weekly prompt, copied from the handoff).
* `research/last-run.md` placeholder.
* `research/inbox.md` placeholder, one line per lead with a link.

## Deploy config

Cloudflare Pages by default. Build command and output directory documented.

---

### DAV-310 — Deploy to Cloudflare Pages and point becauseofai.org at it (Namecheap DNS)

State: Todo · Priority: High · Labels: plumbing  
Blocked by: DAV-301 · Blocks: nothing

## Domain facts (checked 2026-10-22)

`becauseofai.org` is registered at Namecheap, created 2026-10-22, expires 2027-10-22. It currently uses Namecheap default nameservers (dns1/dns2.registrar-servers.com).

## Do

1. Create the Cloudflare Pages project from the repo. Confirm the preview URL builds clean.
2. Add `becauseofai.org` and `www` as custom domains on the Pages project.
3. DNS at Namecheap. Default: switch the domain's nameservers to the pair Cloudflare assigns, so Cloudflare serves DNS and the Pages custom domain verifies without manual records. Alternative if Dave prefers Namecheap DNS: add the CNAME records Cloudflare gives for apex and www.
4. Wait for the certificate, confirm `https://becauseofai.org` and `https://www.becauseofai.org` both serve the site and one redirects to the other.

Claude does the Namecheap and Cloudflare clicking through the browser. Dave signs in once if a session is needed.

## Done when

The apex and www both serve the deployed site over HTTPS, and a push to main redeploys.

---

### DAV-311 — Per-entry OG images (plain text card)

State: Backlog · Priority: Low · Labels: ui  
Blocked by: DAV-303 · Blocks: nothing

Build step 9 of 9, optional, do last (HANDOFF §6).

Default style per HANDOFF §9: a plain text card. Headline sentence, three grade badges, achieved date. No logos, no illustrations.

Generate at build time. One image per entry plus one for the homepage.

---

### DAV-312 — Decisions Dave owns: hosting, newsletter, funder line, pre entries on homepage, OG style, /about copy

State: Todo · Priority: Low · Labels: needs-dave, content  
Blocked by: nothing · Blocks: nothing

HANDOFF §9. The build agent uses these defaults and lists them in README under "Decisions made". Dave confirms or changes each.

* Hosting: default Cloudflare Pages.
* Newsletter provider: default placeholder link to Buttondown.
* Whether `/about` names a funder or sponsor: default "independent, unfunded".
* Whether `pre` entries appear on `/` by default: default yes, muted window badge.
* OG image style: default plain text card.

Also needs Dave's words: the `/about` page copy (who runs it, conflicts policy, contact).

---

### DAV-313 — First weekly research run: close the verify notes and swap press-release sources for papers

State: Todo · Priority: Normal · Labels: research  
Blocked by: DAV-302, DAV-308, DAV-309 · Blocks: DAV-314

Run `research/brief.md` for the first time once the repo, validate, and the PR template exist. Output is a PR, not a report.

## Scope for this run, on top of the brief's standing instructions

* Replace press releases typed `primary` with the actual primary source: GOLDEN BRIDGE II (BMJ paper), Oman retinopathy (ministry report or mark `verify:`), NHS DERM (the NICE early value assessment document), GB-0895 ([ClinicalTrials.gov](<http://ClinicalTrials.gov>) SOLAIRIA-1).
* Locate EdWorkingPaper 26-1598 for `maryland-ai-tutor-negative`, record the primary effect size, and let the entry render.
* Set the window grade on `china-ai-cal-null` from the intervention dates.
* Work through every `verify:` note in the seed (about half the entries carry one).
* For each `not-yet` entry, check whether `what_would_change` has happened.

## Output (per the brief)

1. New or changed entry files, each with a `history` line dated the run day.
2. `research/last-run.md`, under one page.
3. Leads that do not qualify go to `research/inbox.md`, one line each with a link.

Rules: primary source for anything with a number on it, do not invent DOIs or IDs, absolute next to relative, a clean null is worth a win.

---

### DAV-314 — Automate the weekly research run as a scheduled job that opens a PR

State: Backlog · Priority: Low · Labels: research, plumbing  
Blocked by: DAV-313 · Blocks: nothing

After the first manual run proves the brief works end to end.

* Schedule a weekly run of `research/brief.md` with the current `data/entries/` and `research/last-run.md` readable.
* The run opens a PR with entry files, history lines, `last-run.md`, and `inbox.md` changes. CI validates. A human merges.
* Decide the day and hour with Dave. Keep the model and settings explicit (no inherited defaults).

---
