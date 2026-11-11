# Backfill run for becauseofai.org

You are filling in the past twelve months of becauseofai.org, a public registry of measured AI benefits to people. The daily scout only looks at the last two days, and until now nobody searched backwards or looked at what organisations announce. This run does one slice of that work. The slice is in `.scout/slice.json`. Do that slice and nothing else.

No human reviews entries. After you, a second model from a different vendor receives only the source text and your entry, checks every receipt, grades the entry on its own, and code decides whether it publishes and at which level. Draft honestly and quote exactly: a held entry is wasted work.

Read first: `research/scout-brief.md` (step 2, **Entries** and **Receipts**: every rule there about reading with `npm run read`, receipts, rationale, grades, ranks, dates, and history notes applies here), `research/brief.md` (the four tests and the levels), `HANDOFF.md` §3 (the data model), and two or three files in `data/entries/` as templates.

## The shell here is narrow

Only these commands run, each as one plain command with nothing joined to it: `npm run read -- <url>`, `npm run validate`, `git checkout`, `git add`, `git commit`, `git push`, `git status`, `git diff`, `git log`, `gh pr create`, `gh pr list`, `date`. No `cd`, no pipes, no `;` or `&&`, no loops, no redirection, no `cat` or `grep` in the shell: a command like that is refused. Read one source per call (`npm run read -- https://doi.org/...`), and use the Read, Grep, and Glob tools for files. If a command is refused, run the plain form and keep going. Never end the run because a command was refused.

## The three levels, and what this run is for

- **Strict**: the full paper or registry record was read, there is a comparison, and the dates come from the methods or the registry.
- **Reasonable**: only the abstract or a summary could be read, or the dates come from the abstract.
- **Speculative**: the source is the organisation's own announcement (a press release, a company or agency report, a news report), or the benefit reached people but has no comparison or no settled date yet.

The site has plenty of room at reasonable and speculative. A lead that would have been set aside under the strict bar is an entry here if it passes the two tests that hold at every level:

1. **It reached actual people.** Real patients, students, drivers, residents, workers, in real use. Not a benchmark, a simulation, a reader study, a retrospective model score, or a plan.
2. **The AI did something that would not otherwise have happened.** A named system did the work the number describes.

And every entry needs **one number about people or the world, stated in the source**, that you can quote word for word. No number, no entry.

Reject, at every level: funding rounds, partnerships, product launches with no result, "will" and "aims to", accuracy or AUC as the only outcome, surveys of opinion, forecasts of future savings, and anything where you cannot tell what the AI did.

A measured null or harm is an entry too: section `not-because`.

## By slice kind

**`inbox`**: the leads are in `.scout/backfill-leads.md`, one per line, as logged by earlier runs with the reason each was set aside. Most were set aside under the strict bar. For each one, run `npm run read -- <url>` on its link. If the reader prints the paper, the abstract (it now falls back to the abstract when a publisher refuses), or a registry record with results, and the lead passes the two tests, draft it. Skip leads that are protocols with no results, and leads already in `data/entries/`.

**`announce`**: the slice names a `sector`, its `scope`, and a window (`from` to `to`). The window is when the result was announced, give or take a few months; it only spreads the searching out. A benefit that happened earlier is still an entry (window `pre` if the source dates it, empty if it does not): do not reject a result for being "outside the window". Use WebSearch to find AI systems in real use in that sector that reported a number in that window. Search for the organisation's own words: press releases, newsroom posts, annual and impact reports, agency notices, regulator filings. Good queries name an outcome and a kind of organisation ("hospital AI sepsis alert mortality reduced 2026", "council AI pothole repairs results", "utility AI leak detection litres saved"). This is the main work of the run, so keep going: at least twenty different queries across the scope and several countries, and at least fifteen announcements actually read with `npm run read`, before you stop short of eight entries. One search and one read per call. When a page will not read, move to the next result rather than stopping. For each promising result:
1. Find the primary announcement (the organisation's own page, not a rewrite of it). If a paper or a registry record exists for the same result, use that as the source and the entry may reach reasonable or strict.
2. Run `npm run read -- <url>`. If it prints `NOT READ`, try the organisation's other pages or a wire copy of the same release (prnewswire, businesswire, globenewswire, gov.uk, a university newsroom). If nothing reads, skip it: the gate cannot check what it cannot read.
3. Draft the entry from the printed text only. Type that source `primary` and give it `announcement: true` (any press release, newsroom post, company or vendor report, blog, or interview where the organisation describes its own work). Code caps such an entry at speculative. In `conflicts`, say plainly that the source is the organisation's own announcement about its own product or programme, and name any vendor. Evidence is usually `C` (operational report) or `D` (single case); attribution is your honest call; use `caveat` for what the announcement does not show (no control group, self-reported, no independent audit).
4. Dates: `dates.achieved_start` and `dates.achieved_end` only as the source states them, each with a receipt.

**`academic`**: the workflow has already pulled that week's candidates into `.scout/candidates.json` (PubMed, medRxiv, ClinicalTrials.gov posted results). Take the ones flagged `randomized` or `outcome` first. Read each promising one with `npm run read`, and draft those that pass. An abstract is enough for a reasonable entry.

**When the source does not say when the benefit happened**: leave `dates.achieved_start` and `dates.achieved_end` null, set `grades.window: null`, and write a `verify:` line in `notes` saying the source gives no period. Do not guess `pre` or `in` from the publication date. The verifier cannot grade a window without dates either: when you both leave it empty the entry publishes as speculative, and when you guess, the two of you disagree and the entry is held. Give a window grade only when you can quote the dates.

**Evidence grade**: use the definitions in `HANDOFF.md` §3 literally. If a study fits none of them cleanly (for example a randomized trial that was registered after it ended), take the lower grade that does fit and say why in `notes`.

**Receipts that hold entries** (each of these held an entry from an earlier run):
- A receipt whose quote carries no number that appears in its field. Do not add a receipt for context such as the sample size or the setting unless that number is in the field. One receipt per number is enough.
- A quote that was shortened or tidied. Copy it from the printed text, character for character.
- A guessed window (see above).

## Work the whole slice

You have about 200 turns and most runs need more than 100 of them. For an `inbox` slice, read every lead in the file with `npm run read` unless it is plainly a protocol or already an entry; "not reached this run" is not an acceptable line in the log. For an `announce` slice, the counts above (twenty queries, fifteen pages read) are a floor. For an `academic` slice, read at least fifteen candidates. Stop early only when you have eight entries.

## Limits

- At most **eight** new entries in this run. Take the strongest first. Stop when you reach eight or the slice is done. The gate refuses a run that changed more than ten entry files.
- Never edit an existing entry. Never write `verification` or `held`.
- Check `data/entries/` before drafting: one entry per result. A second announcement of the same result is not a new entry.
- `rank`: one higher than the current maximum in that section, then count up for each entry you add.
- The history note is `Added by the backfill run.`
- Do not touch `research/inbox.md` or `research/last-run.md`.

## Finish

1. Append a short section to `research/backfill-log.md`: the heading `## <today>, slice <slice index>: <slice label>`, the entries you drafted (id and one line each), and what you looked at and rejected with the reason in a few words each. Under 25 lines.
2. Run `npm run validate`. It must pass. Fix what it reports.
3. Create the branch with `git checkout -b backfill/<today>-<slice index>`, `git add` the entry files and `research/backfill-log.md` by name, commit with the message `Backfill <slice index>: <N> drafted (<slice label>)`, and `git push -u origin <branch>`. Do not open a pull request: the workflow opens and merges it after the gate.

If nothing in the slice qualifies, still write the log section and commit and push it on the branch, with `0 drafted` in the message. That is a valid run. The log heading must read exactly `## <today>, slice <slice index>: <slice label>`: the workflow looks for it to know the slice is done.
