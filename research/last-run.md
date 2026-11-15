# Last research run — 2026-11-15

Window: 2025-11-15 to 2026-11-15. Inputs: `npm run validate` (28 held), `.scout/candidates.json` (217 candidates over 8 days, 26 flagged randomized, 15 announcements, 0 alerts, 14 Crossref errors), the inbox, and the existing entries. `pdftotext` was installed in this session, so the reader could open PDFs (NBER, EdWorkingPapers, Google, LSHTM) for the first time in a weekly run. Every quote was checked against the reader's text with the gate's own `findQuote`.

## Held list worked (14 entry files changed, 0 added)
- **Missing receipts**: ksau (headline, 79 students), yan (headline, 60 residents), numi (headline, 3.1 points), sumner (reach, which names the 2024-2025 pilot), jeffcom (reach: its only digits are the name "Jeffcom 911"). No value changed.
- **Quotes the gate could not find**: ubc. The reader runs "Methods" into "Thirty" with no space, so a quote starting "Thirty adults" fails the token-boundary match. The 30 now rests on "83% (25/30)".
- **Wrong receipt**: tongji. Dropped the 187-screened quote, which the verifier rightly said does not support 90 randomized.
- **Unstated conflicts**: lungimpact (a Qure.ai SBRI co-applicant and a Qure.ai travel grant, with the paper's statement that Qure.ai had no influence on the design; the headline now says "five NHS trusts" as the Methods do) and tanzania (SELENA+ supplied free for academic use; authors' fees and one author's equity, none from EyRIS).
- **Window left empty by the drafter**: google-eedi (13 April to 7 July 2026 from the report and AEA registry AEARCTR-0018079, now a source; in), forensic images (January to July 2025; pre), tsm-al (September 2024 to June 2025; pre; evidence B now argued from "formal clinical trial registration was not required"), and khanmigo (November 2024 to May 2026 from Table 1; **ongoing**, against the verifier's in, because three of the five measured terms predate the window. Expect it to publish at speculative).
- **spot-tb**: now published in The Lancet Global Health (12 Nov 2026). The abstract matches the preprint (ITT 1.07, per-protocol 1.32, 269,254 screened). It is added as a secondary source because only the abstract could be read, and the not-peer-reviewed caveat is dropped. Re-verification is needed.

## Placed below strict, and what would raise them
- google-eedi stays speculative: the source is the developer's own report, marked `announcement`. A peer-reviewed version would raise it.
- khanmigo is a window disagreement (ongoing vs in), so it publishes at speculative. If a human agrees with "in", it can go higher.
- tsm-al may stay held: the verifier could not grade evidence last time. That is not fixable in the entry.

## Rejected (reached humans · measured against something · AI made the difference · we know when)
- **KITE-CRM cystic renal masses** (EClinicalMedicine, randomized 5,869, Nov 2025 to Feb 2026): fails **AI made the difference** as far as the abstract shows. Benign treatment fell overall (28/2934 vs 104/2935), but in the cystic-mass subgroup the AI actually read, it was not significant (5/29 vs 19/56, p = 0.105), and treated counts differ sharply (171 vs 258) under 1:1 randomization. Inbox for the full text.
- **AI vs teacher essay feedback** (Front Psychol, 312 students): not preregistered, one feedback cycle, and feedback generated in September 2025, so pre. AI matched teachers (d 0.60 vs 0.59 over no feedback). Inbox as a weak lead only.
- **Socratic GPT-3.5 chatbots, medical students** (Med Sci Educ): fails **we know when**, with no study dates given. It is a 10-minute session with a 40-student, implausibly large effect.
- **GenAI vs primary-care physicians, self-management advice** (medRxiv): fails **reached humans**; the study used vignettes.
- **AI-HEALS multimorbidity** (BMJ Open): a protocol. **Perioperative AI-information communication** (Health Expect): the AI is the topic of the information, not the intervention.
- Other randomized hits: AEA registrations in development, protocols, and a CT acquisition trial.

## Searched, empty
- Not-yet checks: rentosertib Phase III began dosing in 2026, with results projected for 2029. GB-0895 SOLAIRIA-1/2 are recruiting with no readout. FireSat has no documented detection with an agency response since the July 2026 launch. Flood Hub and Every Cure were not re-searched this week.
- medRxiv 2026.11.10.26367736 printed a stub, so the abstract came from the bioRxiv API. BMJ Open returned 403.

## Needs a human
- **waymo-injury-crashes**: published without a receipt for `achieved_start` (2019-01). Neither the Safety Impact hub nor the September 2026 post carries a 2019 date. Find the source or set the field to what the hub supports. Left untouched.
- **lungimpact attribution**: the verifier says ai-vs-ai (AI marks visible in both arms), and we say isolated (only prioritisation differs). The argument is in the rationale.
- **khanmigo window**: ongoing vs in, argued in the notes.
- Carried over: Rosie (403, no full text), Oman (no primary source), and the published entries still lacking receipts (validate lists 15).
