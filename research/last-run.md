# Last research run — 2026-10-23

Window: 2025-10-24 to 2026-10-23. Inputs: 27 entries, inbox, `.scout/candidates.json` (161 candidates over 8 days, 11 flagged randomized, 0 alerts, 1 source error). Extra scope: replace press-release primaries with the paper or registry record.

## Added
Nothing. Three candidates were deep-checked and none cleared the bar (see Rejected). That is a valid week.

## Changed (re-sourcing and review)
- **golden-bridge-ii-stroke**: the BMJ paper (doi 10.1136/bmj-2025-085810, read in PMC) replaces the EurekAlert release as primary. **Corrected HR 0.71 → 0.74** (0.58 to 0.93); the 26% and the 10 per 1,000 stand. Beijing Ande Yizhi Technology is a co-funder, and whether it supplied the CDSS is now a `verify:`.
- **columbia-star-birth**: the Lancet letter (doi 10.1016/S0140-6736(25)01623-X) replaces the release as primary. The first couple is the one who tried for nearly two decades (retrieval March 2025). The Klinefelter couple is a later case. Birth month corrected to **November 2025** (per TIME); the window stays `in`.
- **oman-ai-retinopathy**: **now held.** No ministry or programme report has the figures; the MoH page is only the 17 March 2025 launch release. The Muscat Daily article is retyped as secondary. Window **in → ongoing** because the programme started before the window. The vendor (EyRIS) comes from its own claim.
- **nhs-stroke-ai-imaging**: the abstract gives the observation period as 1 Jan 2019 to 31 Dec 2023 and e-publication as 2 Dec 2025, so `pre` is confirmed. Four authors are Brainomix-affiliated.
- **china-ai-cal-null**: window set to **pre**. The AEA registry (AEARCTR-0007888, same 105/315/8,647 sample) dates the intervention 4 Apr to 14 Jun 2021.
- **hurricane-melissa-2025**: the NHC TCR is published (25 Feb 2026) and added as primary. The first explicit Cat 5 forecast was Discussion 18 (2100 UTC 25 Oct, Melissa at 80 kt) and landfall was 1700 UTC 28 Oct, about 68 h later. The headline holds. Corrected "80-mph" to 80 kt (90 mph).
- **rentosertib-phase-3**: the registry is now primary and the Insilico release is secondary. The registry matches: 320 patients, 47 sites in China, start 9 Sep 2026, primary completion Oct 2029.
- **firesat-constellation**: the deployment is confirmed by the operator's release (Muon Space, 7 Jul 2026), added as primary. The summary's "50+ by 2030" isn't in any source read, so it is now a `verify:`.
- **india-tribal-tb-ai-cxr**: achieved dates **corrected** to 1 Aug 2023 to 31 Mar 2024 from the methods. This fixes last week's null-end-vs-`pre` conflict. Eight authors are Qure.ai staff.
- **gb-0895-phase-3**: SOLAIRIA-2 registry added (NCT07359846, 786 planned). The two trials together make 1,572, which explains the old ~1,600. My history line ends "stays unreviewed." so it doesn't clear the editor's open marker.

No downgrades. One I'd argue: china-ai-cal-null evidence **A**. The AEA registration (28 Jun 2021) came after the intervention ended, so the endpoint wasn't strictly preregistered. I've flagged it rather than changed it.

## Rejected (reached humans · measured against something · AI made the difference · we know when)
- **PRIMA-AI** kidney-transplant RCT (npj Digit Med, read in full): **measured** fails as a null. It stopped at 76 of 122, the control rate was 40% vs an assumed 10–15%, and OR 0.96 (0.34–2.64) can't rule out an effect. **When** = Jan–Sep 2024, so pre.
- **SPOT-TB** (medRxiv): **AI made the difference** is unresolved. The ITT result is null, per-protocol is positive, and the gap mostly reflects adherence. It is also an unreviewed preprint and pre-window. Sent to the inbox.
- **AI-INFOCARE**: **measured** still unchecked because NEJM AI returns 403. The protocol makes consultation time a secondary outcome. Kept in the inbox.
- Scout candidates were otherwise protocols, validation studies, or reviews (**reached humans** or **measured** fails).

## Not-yet checks
None met. Rentosertib: Phase 3 recruiting. GB-0895: both Phase 3s recruiting, readouts 2028–29. FireSat: first-light detections (Sep 2026) but no agency response or timing comparison. Flood Hub: no independent impact evaluation found. Every Cure: no in-window MATRIX-originated outcome found.

## Searched, empty
- Waymo hub still runs through June 2026 (271.3M miles).
- Oman: no MoH, WHO or journal report with programme results.
- Null search ("did not improve" AI randomized 2026): only Kenya (already in) and SPOT-TB.
- Retraction Watch: not run beyond the scout's Crossref check (0 alerts).

## Needs a human
- Melissa TCR: the PDF exceeded the run's fetch limit. Read its forecast-verification section and the Jamaica death toll.
- China CAL: the paper's methods for the intervention period (a secondary account says "year-long"), and the call on evidence A.
- STAR: the 2.5M-image, 3.5 mL and two-hour figures against the Lancet letter (403).
- NHS stroke: the DIDO and mRS figures, which aren't in the abstract (paywalled).
- India TB: the "162 confirmed" figure vs 173 notified.
- GOLDEN BRIDGE II: the vendor behind the CDSS.
- Oman is held. Promote it only if a primary appears.
