# Last research run — 2026-11-01

Window: 2025-11-01 to 2026-11-01. Inputs: 30 entries, the inbox, `.scout/candidates.json` (258 candidates over 8 days, 34 flagged randomized, 2 alerts, 1 source error), and `npm run validate` (3 held, 2 warnings).

## Added
None. No candidate cleared all four tests this week, and an empty week is a valid result.

## Changed
- **hurricane-melissa-2025**: **re-graded window in → pre.** The benefit ran from the first Category 5 forecast (25 Oct 2025) to landfall (28 Oct 2025). The window rolled past it on 1 Nov 2026, and only the season verification and the NHC report now fall inside it. No value changed, so the receipts stand. This is a downgrade forced by the calendar, not by new evidence. The entry still holds rank 1, which is a human's call to revisit.

No poster numbers were needed: every `because` entry already has `impact_number` and `impact_label`.

## Rejected (reached humans · measured against something · AI made the difference · we know when)
- **Hong Kong chatbot alcohol SBI** (Drug Alcohol Depend; NCT06602882; abstract read via Europe PMC). A clean null (−10.2 g/week, CI crosses zero), but it fails **we know when**: fieldwork was Dec 2023 to about mid-2025, so the window is pre, and the actual dates sit behind a paywall. **AI made the difference** is unconfirmed: nothing says the chatbot is more than scripted. Registered retrospectively. Sent to the inbox as a possible `not-because`.
- **Voice-guided AI for EUS** (CGH; RCT, n=266). Fails **reached humans** as a benefit, because the outcome is scanning-station completeness, a process measure, and procedures took longer. The dates are unknown.
- **AI-triggered rapid response** (NEJM AI; abstract via Europe PMC). An uncontrolled pre/post design (Oct 2022 to Aug 2024) weakens **measured against something**. **AI made the difference** is bundled (alert plus automatic RRT activation). The window is pre. The full text is still unread.
- **Heidi scribe deployment** (Annals) and **Epic draft replies** (JAMA Netw Open): observational, with clinician-time outcomes. The draft-reply study is mixed and its window is pre. Both went to the inbox.
- **Oxford LLM symptom-advice RCT** (Nature Medicine, Feb 2026, surfaced by the null search). Fails **reached humans**, because participants worked through vignettes, not their own illness. The fieldwork predates the window.
- The other scout hits were registrations, protocols, reviews, education or rating experiments, or did not involve AI.

## Not-yet checks
None met. FireSat: no documented detection or agency response found. Rentosertib: Phase 3 enrolling since July 2026. GB-0895: SOLAIRIA-1/2 still recruiting (Q2 2026 release). Flood Hub: no independent impact evaluation. Every Cure: ARPA-H funding news but no patient outcome tied to MATRIX.

## Searched, empty
- Waymo hub: still through June 2026 (271.3M miles). No new quarter found.
- ChiCTR2400094159 (PreA registration date): web search found no record. chictr.org.cn needs to be read directly.
- Null search ("did not improve", AI, randomized, recent): nothing new in the window.

## Needs a human
- **Melissa rank 1** now sits on a pre-window entry. Decide whether it should stay first.
- **eagle-cadde-colonoscopy-rct**: the verification record is still malformed (`verifier.tokens` keys `cached`, `reasoning`). Re-run the gate (`node scripts/verify.ts --entry eagle-cadde-colonoscopy-rct`) and check the record schema against the vendor output.
- **PreA**: read ChiCTR2400094159 directly. The held grade-split on evidence depends on it.
- Carried over: the Flourish window and evidence grade; the Melissa TCR forecast-verification section; China CAL evidence A; STAR against the Lancet letter; NHS stroke DIDO/mRS; India TB 162 vs 173; the GOLDEN BRIDGE II CDSS vendor. Sixteen published entries still lack some receipts (see `npm run validate`).
