# Docs index

- `../HANDOFF.md`: the original build spec (stack, data model, pages, design, build order, rules for automated runs, owner decisions, definition of done). Where the site departs from it, the "Decisions made" section of the top-level README says so and why.
- `../research/brief.md`: the standing weekly editorial prompt.
- `../research/scout-brief.md`: the daily scout's instructions.
- `../research/vendors.json`: which vendor drafts and which verifies (DAV-376). The gate is `../scripts/verify.ts`; its decision rules are `../scripts/lib/adjudicate.ts` and their contract is `../tests/adjudicate.test.ts`.
- `../data/verifications/`: the public record of every verification and dispute run, one JSON file per run.
- `../research/last-run.md`: the most recent weekly run's note, rewritten each week.
- `../data/seed-entries.yaml`: the import snapshot of the first 25 entries, split into `data/entries/*.yaml` and never edited since.
- `../CLAUDE.md`: conventions for automated and agent sessions working in this repository.
