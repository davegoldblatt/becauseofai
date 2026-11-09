// Entries published before the gate checked every entry (grandfathered by
// DAV-376) and never verified since. They stay published, as strict, as they
// always were. The list is frozen (DAV-469, 2026-11-09): any other entry needs
// a bound two-vendor verification to publish, and its level comes from that
// record. When one of these is changed, the gate runs on it and it leaves the
// list in practice (its bound record decides from then on).
export const LEGACY_STRICT_IDS: ReadonlySet<string> = new Set([
  "advance-ai-ecg-liver", "ambient-scribes-nejm-ai", "china-ai-cal-null", "columbia-star-birth", "ethiopia-tb-ai-cxr",
  "every-cure-repurposing", "fido-northumbrian-leaks", "firesat-constellation", "fortell-ai-hearing-aids", "india-tribal-tb-ai-cxr",
  "kenya-ai-consult-null", "maryland-ai-tutor-negative", "masai-ai-mammography", "nhs-derm-skin-cancer", "nhs-stroke-ai-imaging",
  "rentosertib-phase-3", "tricorder-ai-stethoscope-null", "ucd-als-speech-bci", "ucla-chart-summarizer-rct", "uva-comet-deterioration-null",
  "waymo-injury-crashes",
]);
