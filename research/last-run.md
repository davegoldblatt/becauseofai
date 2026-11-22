# Last research run — 2026-11-22

Window: 2025-11-22 to 2026-11-22. Inputs: `npm run validate` (77 held before this run), `.scout/candidates.json` (234 candidates over 2026-11-14 to 2026-11-22, 17 flagged randomized, 10 announcements, 0 alerts, 65 source errors), the inbox, and the existing entries. `pdftotext` was installed again in this session. Every quote was checked against the reader's text with the gate's own `findQuote`.

## Added (1)
- **instructor-designed-ai-19-universities-stem-exams-rct** (arXiv 2611.19099, 14 Nov 2026; read in full). Pre-registered (OSF, 28 Feb 2025) class-randomized trial: applied STEM classes at 19 universities used AI tools their instructors designed, now or a term later. Proctored, AI-free exams +0.32 SD at student level (95% CI 0.06 to 0.59) and +0.26 SD at class level. No change in engagement or satisfaction. Graded **B** (preprint; class-level randomization with 44 class-terms analysed; the headline regressions are slightly simpler than the pre-registered ones), **bundled** (the AI arrives with the instructor's course redesign and the team's support), and **ongoing** (cohorts in spring 2025, fall 2025 and spring 2026; only the last is fully in the window). Conflicts stated: the instructors who designed the tools are co-authors, and Google co-developed the platform.

## Held list worked (9 entry files changed)
- **numi**: corrected 3.1 to **3.2 percentage points** in the headline, impact_number and effect.absolute. Tables A2 and A3 give 0.032, and 40.2 − 37.0 = 3.2; the prose rounds to 3.1. Receipts now quote the table rows, and the unsupported "suggestive" receipt is gone.
- **nestle-zest**: the source gives both 480,529 and 499,863 meals, so the meals figure is removed from the summary and effect.absolute. The tonnage (201.9 t) and the 94,133 people stand.
- **qingdao**: the headline said 189 patients got the AI follow-up. It is 96, against 93 on conventional care. Corrected, with a new receipt.
- **link-hf2**: the paper counts 17 control HF rehospitalizations and the registry's posted 90-day result counts 16. The discrepancy is now stated in the caveat and notes, and the paper's values are kept (both sources show a null).
- **Missing or unsupported receipts, no value changed**: dublin (headline), amgen (impact, plus a headline receipt for the 27 liaisons), medical-students-socratic (impact now quotes the 10-minute session), ai4u (dropped a headline receipt with no number), khanmigo (dropped the school-year receipt for achieved_start; Table 1's Nov 4 start remains).
- Not fixable in the entry: most remaining holds are "verifier could not grade" on evidence or window. That is a gate-side outcome, so those entries were left alone.

## Placed below strict, and what would raise them
- The 19-universities entry will be at most reasonable if the verifier says A on evidence (our B is the more cautious grade), and it may be speculative on the window (ongoing vs in). The peer-reviewed version would settle the evidence grade.
- dublin and link-hf2 rest on abstracts (Europe PMC), so they are reasonable at best. Full texts would raise them.
- nestle-zest stays speculative: trade press, no dates, no baseline.

## Rejected (reached humans · measured against something · AI made the difference · we know when)
- **GenAI-DBT** (arXiv 2611.25428, 45 students): its primary outcomes (MAAS, DERS, mood) were null, but it is a feasibility pilot not powered to show a difference. It is neither a clean benefit nor a clean null, so it fails **AI made the difference**. Inbox.
- **Vibe Interventions** (arXiv 2611.20315) and the **AI Adoption Survey Experiment** (AEA 20199) fail **reached humans** as a measured benefit. **ACTIVE**, **ambient-AI nursing** and **HIET-2** are protocols.
- **Pancreatic fistula multi-reader study** (BJS) and **DL-reconstruction low-contrast CTPA** (image quality): reader or image outcomes, so they fail **reached humans**.
- **Agentic AI vs paediatric emergency physicians** (medRxiv): retrospective cases, failing **reached humans**.
- Announcements: **Samsara** (already in the inbox; company report, no comparison group), **Alpha School** (no comparison), **Alzheimer's risk prediction** (validation, failing **reached humans**), **Microsoft farmer climate information** (deployment, no measurement), and the pharma timelines, Rockefeller/OpenAI funding and product news (no benefit measured).

## Searched, empty
- Not-yet checks: **Every Cure**: ARPA-H follow-on funding and an OpenEvidence partnership, but no patient outcome from a MATRIX match. **FireSat**: no documented detection with an agency response since launch. **Flood Hub**: no independent evacuation or loss evaluation; the Bihar 30% medical-cost claim is still only a PreventionWeb case study (in the inbox since October). Rentosertib Phase III and GB-0895 were not re-searched this week (last week: readouts 2029 and recruiting).
- Waymo's quarterly hub was not re-read this week.

## Needs a human
- **ai4u**: this run the reader fell back to the Europe PMC abstract, so receipts quoted from the full text (42 analysed, July 2022 to February 2023) did not match in my check. This is probably transient; if the gate reports them, it is the reader, not the quotes.
- **link-hf2**: decide whether the registry's 90-day count (16) or the paper's (17) should lead.
- **19-universities entry**: "7,200 students" sums enrollments across semesters (Fig. 1b), and the entry's reach says "enrollments". Check that a reader will not take it as unique students.
- Carried over: the waymo-injury-crashes `achieved_start` receipt, rosie (403), oman (no primary source), the Crossref alert on the jordan nursing entry (new F1000 version 2), and the 15 published entries still lacking receipts.
