# Last research run — 2026-11-09

Window: 2025-11-09 to 2026-11-09. Scope this run (DAV-469 backfill): work the inbox from the top for leads that qualify at any level; no weekly review of existing entries and no edits to them. Inputs: the inbox, `.scout/candidates.json` (217 candidates over 8 days, 24 flagged randomized, 0 alerts, 0 errors), and `npm run validate`. Every number was quoted from text `npm run read` printed.

## Added (6)
- **ai-infocare-lay-summaries-rct** (because, A · isolated · pre; **reasonable**). NEJM AI; DRKS00036810. 300 Dresden neurosurgery outpatients; AI lay summary before the visit: interaction quality 4.42 vs 4.25 (primary), consultations 25 vs 33 min. Pre: May 2025 to Jan 2026.
- **rwjbarnabas-ai-rapid-response** (because, B · bundled · pre; **reasonable**). NEJM AI. Epic Deterioration Index plus automatic rapid-response paging, 11 hospitals, 23,132 patients: mortality 18.6% vs 23.1%, adjusted OR 0.82. Pre/post with no concurrent control; start date left unverified.
- **heidi-ambient-scribe-boston** (because, B · isolated · ongoing; **reasonable**). Annals. 902 clinicians: −1.21 min of note time per encounter, no change in after-hours work. A Heidi Health co-author is stated as a conflict.
- **spot-tb-ai-camp-targeting-null** (not-because, A · isolated · pre; **strict**). medRxiv; NCT06017843. AI-sited TB X-ray camps in Pakistan, 269,254 screened: ITT RR 1.07 (0.94–1.22). The per-protocol +32% is shown but not used as the headline.
- **latent-ai-ecg-af-null** (not-because, A · isolated · ongoing; **reasonable**). Circulation; NCT06847932. 14,665 adults: AF found 0.3% vs 0.2%, treatment started 2.3% vs 2.4%; the composite primary is fragile (P 0.046, or 0.057 if one event is reclassified).
- **columbia-epic-ai-draft-replies-null** (not-because, B · isolated · pre; **strict**). JAMA Netw Open (PMC). Adoption came with 8.6% slower turnaround and no drop in after-hours replies; the −29.5% on messages where the draft was used is selection.

## Placed below strict, and what would raise them
AI-INFOCARE, RWJBarnabas, Heidi and LATENT are reasonable because the publishers (NEJM AI, Annals, Circulation) return 403 and none is in PMC, so the numbers come from Europe PMC abstracts. A PMC copy or a readable full text would raise each to strict. RWJBarnabas would also need its achieved start, which only the full text has.

## Rejected (reached humans · measured against something · AI made the difference · we know when)
- **GI-cancer DeepSeek nutrition RCT** (Support Care Cancer): fails **we know when**. Methods says screening ran Jan to Mar 2026, Results says Dec 2025 to Feb 2026, and the paper was received 29 Mar 2026 with 30-day follow-up complete for all 90. The Methods window is impossible.
- **AI-assisted micro-TESE** (Asian J Androl): fails **AI made the difference**. Allocation was by "availability" of the AI microscope over 2020 to 2024, with no timing given, so the AI is confounded with time. Inclusion criterion 5 (ICSI with retrieved sperm) also contradicts the 44% with no retrieval.
- **Paediatric ED LLM discharge documents** (medRxiv): not a clean null. The CI allows ±10 points, post-randomisation replacement left an evaluable group not protected by randomisation, and it was registered retrospectively. Same call as PRIMA-AI.
- **Frontline workers with ChatGPT, Lagos** (JMIR): fails **reached humans**. Vignette questions, rated by panels.
- **Calibrated LLM grand-rounds summaries** (medRxiv): no measured benefit; the between-student difference was +0.28/10 (P = 0.28) on quizzes.
- **DEEP-AF** (Heart Rhythm O2): a design paper with no results.
- **AI for Proactive Mental Health** (NEJM AI): the same Flourish app in fall 2024 (pre), and the abstract gives no effect sizes. Context for the Flourish entry, not a new entry.

## Searched, empty or unreadable
- NUMI AI tutoring (NBER w35621): PDF only, and `pdftotext` is not installed in this session's environment, so the reader could not print it. The gate on GitHub can; the next run should retry.
- Bihar flood warnings (PreventionWeb): HTTP 403. Four-year university chatbot RCT (EdWorkingPaper 26-1409): the HTML page has no numbers or dates, and the paper is a PDF.
- Candidates: the 24 randomized hits were registrations, protocols, survey experiments, reader studies, or leads already in the inbox. The only new result was LATENT, drafted above.

## Needs a human
- **Window calls on straddling studies**: AI-INFOCARE is pre (2 of 7.5 months in window), LATENT is ongoing (it started 4 months before the window opened), and Heidi is ongoing (3 months of in-window data). Each is argued in its notes; the verifier may split.
- **LATENT section**: not-because on detection and treatment. A human could read it as a narrow detection gain instead.
- **RWJBarnabas evidence B vs C**: a pre/post with risk adjustment and no concurrent control. C is defensible if the full text shows no staggered control.
- **Conflicts to check in the full texts**: AI-INFOCARE (the vendor page says a co-author is a co-founder), LATENT (who built the model), SPOT-TB (whether the sponsor developed MATCH-AI).
- Carried over, untouched this run as scoped: Rosie no-full-text, Oman no-primary-source, Flourish grade-split, Melissa TCR tables, eagle-cadde record, and published entries still lacking receipts.
