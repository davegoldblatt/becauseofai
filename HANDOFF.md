# becauseofai.org — build handoff

You are building a public registry of measured AI benefits to humans. Every entry is a sentence that starts "Because of AI, …" and has to earn that claim with a primary source, a comparison, an *achieved* date (not a publication date), and three grades. The site also publishes what did **not** work and what is **not yet** proven. The data is the product; the website is a reader for it.

Read this whole file before writing code. Then read `data/seed-entries.yaml` and `research/brief.md`.

---

## 1. What this is (and isn't)

**Is:** a registry. Think `incidentdatabase.ai` or Our World in Data — calm, dense, sourced, boring in the good way. One list, strong filters, permanent entry pages, a methodology page people actually read.

**Isn't:** a landing page, a news feed, a dashboard with animated "lives saved" counters, or an automated paper scraper. The anti-pattern is truvace.com/the-index: 2,700 LLM-scraped entries in two months where unrelated papers carry identical sub-scores. We never auto-score. Every number on this site was put there by a human who read the primary source.

**The question every entry answers:** what changed for people, compared with what, when did it actually happen, and what part did AI play.

---

## 2. Stack and constraints

- **Astro** (static output), TypeScript, plain CSS with design tokens (no Tailwind unless you have a strong reason; keep the CSS readable).
- **Content = YAML.** One file per entry in `data/entries/<id>.yaml`. Start by splitting `data/seed-entries.yaml` into per-entry files. Never put entry content in components.
- **Schema validation at build time** with zod (`src/schema.ts`). Build fails if any entry is missing: `headline`, `summary`, `section`, `domain`, `grades.evidence`, `grades.attribution`, `grades.window`, `dates.published`, at least one `sources[]` item with `type: primary`. Watchlist entries must have `what_would_change`.
- **No database, no CMS, no auth, no backend.** Submissions and disputes go to GitHub issue templates (`.github/ISSUE_TEMPLATE/`). Newsletter is a link (Buttondown) — leave a placeholder.
- **Search:** Pagefind at build time. **Analytics:** none by default; leave a commented Plausible snippet.
- **Deploy:** Cloudflare Pages (or Vercel — either is fine). Custom domain `becauseofai.org`. Include `README.md` with deploy steps and a `CLAUDE.md` for future sessions summarizing conventions.
- **Outputs besides HTML:** `/feed.xml` (RSS, newest `dates.added` first), `/api/entries.json` (all entries, full fields), `/sitemap.xml`, per-entry OG image (nice-to-have; do last).
- Mobile-first. 16px side gutters. No horizontal scroll at 375px. Dark mode via `prefers-color-scheme` and a toggle.
- Lighthouse ≥ 95 on all four categories for `/` and an entry page.

---

## 3. Data model

```yaml
id: hurricane-melissa-2025           # slug, stable forever
section: because                     # because | not-because | not-yet
rank: 1                              # editorial order within section (lower = stronger)
headline: >-                         # full sentence. For `because`, starts "Because of AI, …"
  Because of AI, the Hurricane Center called a Category 5 landfall in Jamaica
  about three days out, while Melissa was still a Category 1.
impact: "~3 days' warning on a Cat 5"   # ≤ 6 words, shown as the card's number badge
summary: >-                          # one sentence: what was measured, vs what, when
  …
caveat: >-                           # one sentence: the single most important limitation
  …
domain: disaster                     # medicine | disaster | transport | education | infrastructure | work | accessibility
ai_type: classic-ml                  # classic-ml | generative | hybrid
grades:
  evidence: B                        # A randomized/cluster-randomized, preregistered primary endpoint
                                     # B large observational or population-level with credible benchmark
                                     # C company/government operational report, no independent comparison
                                     # D single case or anecdote
  attribution: isolated              # isolated  = comparison isolates AI's contribution (arms differ only by AI)
                                     # only-path = no human/conventional alternative existed in practice
                                     # bundled   = AI shipped inside a package (tablets, protocols, crews) and the package was tested
                                     # ai-vs-ai  = the control also used AI
  window: in                         # in = benefit occurred inside the last 12 months
                                     # ongoing = began earlier, still delivering, with new in-window data
                                     # pre = benefit predates the window; only the publication is new
comparison: "DeepMind ensemble vs all other operational models and NHC official forecast, 2025 Atlantic season"
effect:                              # optional; show absolute next to relative whenever both exist
  relative: "26% fewer new vascular events"
  absolute: "10 fewer events per 1,000 patients at 3 months"
reach: "Jamaica, pop. 2.8M; 2025 Atlantic season"   # actual reach, separate from study size
dates:
  achieved_start: 2025-10-25         # when the benefit actually occurred (YYYY-MM-DD or YYYY-MM)
  achieved_end: 2025-10-28
  published: 2025-12-03              # first public report of the result
  added: 2026-10-22
  updated: 2026-10-22
sources:
  - title: "CNN: Why NHC bet big on AI to forecast Isaias"
    url: https://…
    type: secondary                  # primary | secondary
conflicts: "none found"              # funding, employee authorship, vendor-run, etc.
what_would_change: >-                # required for not-yet; optional elsewhere ("what would move the grade")
  …
notes: >-                            # editor-only; render on entry page in a muted "editor's notes" block
  …
related: [nhs-stroke-ai]             # other entry ids
history:
  - date: 2026-10-22
    note: "Added."
```

The seed file uses exactly these fields. Some seed entries have `verify:` notes in `notes` — leave them visible; they're honest.

**Rendering rule for grades:** three badges on every card, three distinct hue families (evidence = blue scale, attribution = green/amber, window = gray/teal). Each badge links to its definition on `/method`. Never collapse grades into a single score.

**Rendering rule for dates:** every card and entry page shows `Achieved` and `Published` side by side, same weight. If `achieved_end` is null, show `Achieved: ongoing since <start>`.

**Rendering rule for effect:** when `effect.absolute` exists, show it next to `effect.relative` in the same line, e.g. "26% fewer (10 per 1,000)".

---

## 4. Pages

| Route | Purpose |
|---|---|
| `/` | Thesis line + filter bar + the `because` list ordered by `rank`. Counts line: "16 because · 4 not because · 5 not yet". |
| `/entry/[id]` | Full entry: headline, impact, badges, dates, summary, caveat, comparison, effect, reach, conflicts, what-would-change, sources (primary first), notes, related, history. Canonical permalink; "Cite this entry" block with URL + updated date. |
| `/not-because-of-ai` | The `not-because` section. Same card component. Short intro: why nulls are here. |
| `/not-yet` | The `not-yet` section. Each card shows `what_would_change` prominently. |
| `/method` | The four tests; the grade vocabulary with one example each from the live entries; the achieved-vs-published rule with GOLDEN BRIDGE II as the worked example; "why we don't auto-score" with a description of the Truvace identical-scores problem (no screenshot of their site; describe it); how to submit or dispute. |
| `/changelog` | Generated from every entry's `history[]`, newest first, grouped by date. |
| `/about` | Who runs it, funding (none), conflicts policy, contact. Leave copy placeholders for Dave. |
| `/feed.xml`, `/api/entries.json`, `/sitemap.xml` | As above. |

**Filters (on `/`, `/not-because-of-ai`, `/not-yet`):** domain, evidence, attribution, window, ai_type. Client-side, URL-param driven (`/?window=in&evidence=A`) so filtered views are shareable. Default view shows all windows; `pre` entries get a visibly muted window badge so they're not mistaken for new.

---

## 5. Design

- Headline face: a serif with good numerals (Newsreader or Source Serif 4 via Google Fonts). Body: system sans. Tabular numerals everywhere numbers appear.
- Palette: warm off-white / near-black backgrounds, one muted accent. Badges are the only saturated color.
- Card = headline (bold, the full "Because of AI, …" sentence) → impact badge → three grade badges → achieved/published → summary → caveat (smaller, muted) → primary source link → "updated" stamp.
- No hero image. No illustrations. No logos of companies. No testimonials. No counters that imply totals we didn't measure.
- The thesis line at the top of `/`: **"Every entry here reached a human, was measured against something, and names the date it happened — not the date it was published."**

---

## 6. Build order

1. Scaffold Astro + zod schema + loader. Split seed YAML into `data/entries/*.yaml`. `npm run validate` must pass.
2. Card component + `/` with rank ordering and counts. Entry pages.
3. Filters with URL params. Section pages.
4. `/method`, `/about`, `/changelog`.
5. RSS, JSON endpoint, sitemap, Pagefind.
6. Dark mode, responsive pass at 375 / 768 / 1280, Lighthouse.
7. `.github/`: issue templates (submit entry, dispute entry), PR template ("one entry file + history line; link primary source"), CI that runs `validate` and `build`.
8. `README.md`, `CLAUDE.md`. Deploy config.
9. OG images (optional).

Commit after each step with a plain message.

---

## 7. Rules for the agent

- **Do not invent or alter content.** Numbers, dates, grades, and sources in the seed are editorial decisions. If a field looks wrong, leave it and add a line to `notes:` starting with `verify:`. Do not "fix" grades.
- **Do not add entries.** If you find something that should be an entry, write it into `research/inbox.md` with a source link.
- **Do not add scoring, ranking algorithms, sentiment, or AI-generated summaries.** `rank` is set by a human.
- **Do not add analytics, cookies, trackers, or third-party scripts** beyond fonts and Pagefind.
- **Do not use a database or CMS.** YAML in git is the CMS; the git history is the audit trail.
- Keep dependencies minimal. If you reach for a UI library, stop.
- When a decision is genuinely Dave's (see §9), make the reasonable default, note it in `README.md` under "Decisions made", and move on.

---

## 8. The weekly research run (context, not your job to build)

`research/brief.md` is the standing prompt a model runs weekly. It reads the current entries and last run's report, searches, verifies against primary sources, and proposes a PR: new entry files, edits with `history` lines, and a short note. A human merges. Your job is to make that workflow smooth: the schema is strict, `validate` is fast, the PR template is clear, and `/changelog` picks up the `history` lines automatically. Add a `research/last-run.md` placeholder and `research/inbox.md`.

---

## 9. Decisions Dave still owns (use defaults, flag in README)

- Hosting: default Cloudflare Pages.
- Newsletter provider: default placeholder link to Buttondown.
- Whether `/about` names a funder/sponsor: default "independent, unfunded."
- Whether `pre` entries appear on `/` by default: default yes, muted.
- OG image style: default plain text card.

---

## 10. Definition of done

- `npm run validate && npm run build` pass clean.
- Every entry page shows Achieved and Published side by side; every card shows three badges.
- No entry without a primary source renders.
- Filters change the URL and reload state from it.
- `/feed.xml` validates; `/api/entries.json` returns every entry with full fields.
- 375px width: no horizontal scroll, cards readable, badges wrap.
- Lighthouse ≥ 95 ×4 on `/` and one entry page.
- `/method` reads in under three minutes and every badge on the site links to it.
- `README.md` explains: how to add an entry, how to run validate, how to deploy, and lists "Decisions made."
