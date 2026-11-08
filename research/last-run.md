# Last research run — 2026-11-08

Window: 2025-11-08 to 2026-11-08. Inputs: 30 entries, the inbox, `.scout/candidates.json` (215 candidates over 8 days, 21 flagged randomized, 1 alert, 0 errors), and `npm run validate` (4 held, 1 warning).

## Added
- **rosie-chatbot-maternal-null** (`not-because`, A · bundled · pre). JAMA Netw Open, 4 Nov 2026; NCT06053515. 400 pregnant and postpartum people from minoritized groups were randomized to the Rosie generative-AI chatbot or a monthly book club. At 12 months GAD-7 differed by 0.10 points and PHQ-9 by −0.23, and the moderate-or-severe prevalence ratios crossed 1. A clean null against an active control. **Bundled** because the chatbot came with videos, a syllabus and social-worker-reviewed alerts. **Window pre**, argued: enrollment ran Oct 2023 to Dec 2024 and follow-up ended Dec 2025, so only the final weeks fall inside the window. Flag: the registry's primary outcomes (PHQ-9, ER visits, well-baby visits) differ from the paper's (GAD-7, PHQ-9). Read through a web fetch, but the gate's reader got HTTP 403 on 5 Nov, so it may be held as `no-full-text` until a PMC copy appears.

## Changed (held list first)
- **hurricane-melissa-2025** (held `ungrounded`): **corrected.** Removed the "extra day in 2023–2025 hindcasts" clause, which came from Gizmodo (secondary), and the population and season year from `reach`. No primary source I could read carries them: the NHC report PDF exceeds the fetch limit and the Lowry post returns 403. The claims the report supports stay.
- **prea-chatbot-specialist-referral-rct** (held `grade-split`, evidence): **verified registration.** The WHO ICTRP copy of ChiCTR2400094159 shows prospective registration on 17 Dec 2024, first enrolment 8 Feb 2025, and the same three primary outcomes as the paper. Added it as a primary source. Evidence A is unchanged and now argued in the notes.
- No poster numbers were needed: every `because` entry already has `impact_number` and `impact_label`.

## Left as is
- **flourish** (`grade-split`, window): no change. It is an argument, not a value, and the window rolling forward makes `pre` stronger.
- **oman** (`no-primary-source`): searched again and found only press relaying ministry statements. Third week held. If no primary appears, a human should decide whether to remove it.

## Rejected (reached humans · measured against something · AI made the difference · we know when)
- **ALERT-PA** (NCT05925569): fails **AI made the difference**. The registry describes a rules-based Epic best-practice alert with no AI.
- **AI Doppler feedback RCT** (AJOG MFM): likely fails **reached humans**, since the outcome is clinician assessment, a process measure. Abstract unread; sent to the inbox.
- **LATENT AI-ECG** (Circulation): publisher 403 and no indexed abstract. The registered primary is AF detection, which raises the **reached humans** question. Sent to the inbox.
- The rest were protocols, AEA registrations still in development, retrospective model validations, reviews, surveys and vignette studies.

## Not-yet checks
None met. FireSat: launched Jul 2026, live data to agencies expected by year end, but no documented detection or response. Rentosertib: GENESIS-IPF-3 first patient dosed Sep 2026, completion 2029. GB-0895: SOLAIRIA-1/2 still recruiting. Flood Hub: no independent evaluation (a Bihar case study went to the inbox). Every Cure: nothing new found.

## Searched, empty
- Waymo hub: still through June 2026 (271.3M miles).
- Null search ("did not improve" / "no significant", AI, randomized): nothing new beyond Rosie.
- Rosie and LATENT in Europe PMC: not yet indexed.

## Needs a human
- **Rosie**: if the gate holds it for `no-full-text`, add the PMC copy when it appears. Rank 6 is a placeholder at the end of not-because.
- **Melissa**: confirm "lowest season track and intensity error of any model" against TCR Tables 5b and 6b. Rank 1 still sits on a pre-window entry.
- **Oman**: remove it, or keep holding.
- **eagle-cadde**: the verification record is still malformed. Re-run the gate.
- Carried over: Flourish window, China CAL evidence A, STAR vs the Lancet letter, NHS stroke DIDO/mRS, India TB 162 vs 173, GOLDEN BRIDGE II CDSS vendor, and fifteen published entries still lacking some receipts.
