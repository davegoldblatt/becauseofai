# Last research run — 2026-10-22

Window: 2025-10-23 to 2026-10-22. Inputs: 25 entries, inbox, `.scout/candidates.json` (219 candidates, 14 flagged randomized, 0 alerts, 1 source error).

## Added
- **advance-ai-ecg-liver** (because, A / isolated / pre). Mayo cluster RCT: notifying clinicians of an AI-ECG flag doubled new advanced-liver-disease diagnoses (1.0% vs 0.5%; ~5 per 1,000). Clean comparison, but the outcome is a diagnosis, and the trial ended Sept 2025, so the window is pre. Numbers come from the registry results and the PubMed abstract; full text is paywalled.
- **kenya-ai-consult-null** (not-because, A / isolated / pre). Nature Medicine, June 2026, 9,691 patients: GPT-4o decision support improved notes and plans but not 14-day treatment failure (2.2% vs 2.0%, aOR 0.77, p=0.13). Read in full (open access). Enrolment Apr–Jul 2025, so pre. It is the patient-outcome counterpoint to the earlier Penda/OpenAI quality-improvement claims.

## Changed
- **maryland-ai-tutor-negative**: primary found (EdWorkingPaper 26-1598); effect recorded as −0.37 SD in final grades. The entry now renders.
- **gb-0895-phase-3**: ClinicalTrials.gov primary added (entry now renders). Removed "~1,600 patients" from the headline because the registry shows 786 planned for SOLAIRIA-1.
- **fortell-ai-hearing-aids**: the 30-person trial is confirmed in IJA (Oct 8, 2026), which closes the old `verify:`. Evidence stays C under the company-run rule. A new `verify:` asks someone to check the "9.2 vs 3.1 dB" framing against the abstract's figures.
- **ambient-scribes-nejm-ai**: notes now say the Duke JAMIA trial is scribe-vs-scribe (ai-vs-ai) and can't support the isolated grade.

No downgrades this week. I'd argue two grades but haven't changed them. First, oman-ai-retinopathy at `window: in` with no start date: if the program predates Oct 2025 it is `ongoing`. Second, india-tribal-tb-ai-cxr has `achieved_end: null` (ongoing) while graded `pre`. One of those two fields is wrong.

## Rejected (four tests: reached humans · measured against something · AI made the difference · we know when)
- Fetal intracranial malformation self-crossover RCT (Lancet Digit Health): **reached humans** fails because the outcome is reader sensitivity on offline review. **When** fails too: Sep 2022–Nov 2023 per a secondary source, so pre.
- AI-INFOCARE (NEJM AI): not rejected on merit. **Measured** couldn't be checked because the primary returned 403 and the only figures are on the vendor's page. Sent back to the inbox.
- VoqX auscultation, breast-ultrasound DSS, Uganda sputum AI, multi-agent LLM notes: **reached humans** fails (accuracy or validation only).
- VITAL-MD, PM Heart, CURAte: protocols only, so **measured** fails.

## Not-yet checks
None of rentosertib, GB-0895, FireSat, Flood Hub, or Every Cure has met its `what_would_change`. No FireSat detection-to-response case is documented. Flood Hub has no independent impact evaluation; Google's own loss-reduction estimate doesn't count. Every Cure has no in-window patient outcome traced to MATRIX. SOLAIRIA-1 reads out ~Dec 2028.

## Searched, empty
- Waymo hub still runs through June 2026 (271.3M miles); no Q3 update yet.
- No final NHC Tropical Cyclone Report for Melissa found, so the first explicit Cat 5 advisory time stays unverified.
- China CAL intervention dates: the CESifo PDF wouldn't extract.
- Null search ("did not improve", "no significant"): found Kenya; a 76-patient kidney-transplant RCT (npj Digit Med) is too small and was sent to the inbox.
- Retraction Watch: not run beyond the scout's Crossref check (0 alerts).

## Needs a human
- Advance: ECG enrolment dates from the Nature Medicine methods (paywalled).
- AI-INFOCARE: the NEJM AI full text, to confirm the vendor-reported consultation times (median 25 vs 33 min) and patient ratings, and recruitment May 2025–Jan 2026 (straddles the window).
- Maryland: randomization unit, term dates, and uptake from the full PDF.
- Ranks: new entries were placed last in their sections (because 17, not-because 5). Re-rank by hand.
