# Last research run — 2026-10-25

Window: 2025-10-26 to 2026-10-25. Inputs: 28 entries, the inbox, `.scout/candidates.json` (251 candidates over 8 days, 27 flagged randomized, 0 alerts, 0 errors), and `npm run validate` (2 held).

## Added
- **prea-chatbot-specialist-referral-rct** (rank 19, at the end; a human sets rank). Tao et al., Nature Medicine (doi 10.1038/s41591-025-04176-7), read in full from Europe PMC. This was a three-arm RCT at two hospitals in western China, with 2,069 patients analysed and 111 specialists. In the arm where patients used the PreA chatbot (GPT-4o mini) alone, consultations ran 3.14 vs 4.41 min (−28.7%, CI 22.7–34.8) and patient-rated communication ease was 3.99 vs 3.44. Graded **A / isolated / pre**: recruitment ran 8 Feb–30 Apr 2025, so only the publication (19 Jan 2026) is new. The caveat says it plainly: the gains are time and experience, not health. Patients were unmasked, and the control had no pre-assessment at all. Two authors work at Tencent WeChat AI.

## Changed
- **flourish-ai-coach-students-rct** (held, grade-split on window). Added the registry (NCT06668532) as a primary source. **Corrected achieved_end 2025-11 → 2025-11-28**, the registry's actual completion date, with a new receipt. Window stays **pre**, argued in notes: about 5 of the study's ~29 weeks fall inside the window. A new `verify:` line notes that the registered primary outcomes (Flourishing Scale, PHQ-8, GAD-7, PSS-4, resilience, at 6 weeks and 3 months) are not what the paper headlines (PHQ-2 meaningful improvement in an elevated-baseline subgroup at 6 weeks). The registered site is the University of Manitoba.
- **oman-ai-retinopathy** (held, no primary). Poster number set to **62→8 days** (the absolute figure behind the 87%). Added Times of Oman as a secondary source and a rationale. There is no receipt because receipts must come from a primary source, and there still isn't one.

No downgrades. One I'd argue: Flourish evidence A. The trial is randomized and registered, but the headline is not a registered primary endpoint as written. I flagged it rather than downgraded it, since a grade change would only add a second split.

## Rejected (reached humans · measured against something · AI made the difference · we know when)
- **Community-codesigned primary-care chatbot** (Nature Health, PMC, read in full): fails **AI made the difference**, because both arms used the chatbot (AI vs AI). The outcomes were awareness and ratings with no health outcome, and it ran March 2025.
- **Change.org AI writing tool** (Nature Human Behaviour; arXiv abstract read): **reached humans** is doubtful as a benefit to people, since the outcome is petition engagement. **AI made the difference** is weak because the estimate is of tool access, via difference-in-differences, not of use. The rollout was in late 2023. Sent to the inbox as a possible `not-because`.
- **AI-INFOCARE**: still unread (NEJM AI 403). **Measured** is unconfirmed. Kept in the inbox.
- Other scout candidates were reviews, protocols, retrospective model development, or clinician-task experiments, so **reached humans** fails.

## Not-yet checks
None met. FireSat: no agency response or timing data after commissioning; coverage is still about the July launch. Rentosertib and GB-0895: no change since 23 Oct (Phase 3s recruiting). Flood Hub and Every Cure: nothing new found.

## Searched, empty
- Waymo hub: still through June 2026 (271.3M miles, 82%). No change.
- Oman: no ministry, WHO or journal report. The same August 2026 statements appear in Times of Oman, Muscat Daily, Kuwait Times and Zawya.
- Null search ("did not improve", AI, randomized): only Kenya and UVA CoMET, both already entries.
- Retraction Watch: not run beyond the scout's Crossref check (0 alerts).

## Needs a human
- PreA: read ChiCTR2400094159 to confirm it was registered before 8 Feb 2025 (evidence A depends on it). Also decide whether a shorter visit counts as a benefit to patients here.
- Flourish: settle the window (pre vs in) and the evidence grade given the outcome mismatch. The paper's "May and November 2025" enrolment doesn't fit the registry's 28 Nov completion.
- Sixteen published entries still lack receipts for some numeric fields (see `npm run validate`). That is the next re-sourcing job.
- Carried over: Melissa TCR forecast-verification section; China CAL methods and the call on evidence A; STAR figures against the Lancet letter; NHS stroke DIDO/mRS; India TB 162 vs 173; the GOLDEN BRIDGE II CDSS vendor.
