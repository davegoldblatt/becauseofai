// Entries published before the gate checked every entry (grandfathered by
// DAV-376) and never verified since. They stay published, as strict, as they
// always were. The list is frozen (DAV-469, 2026-11-09): any other entry needs
// a bound two-vendor verification to publish, and its level comes from that
// record.
//
// Each id is frozen with the hash of its content on 2026-11-11. An entry is
// grandfathered only while its content still has that hash, it carries no
// verification block, and the gate has made no verification record for it
// since the freeze. Once the gate has run on it, its bound record decides,
// for good: taking the verification block off again does not bring the
// grandfathering back.
export const LEGACY_FROZEN_ON = "2026-11-09";
export const LEGACY_STRICT: ReadonlyMap<string, string> = new Map([
  ["advance-ai-ecg-liver", "1df3788620ce1272e18a01c9a14d6ffda55a352524f8204ec4183354cc22ff34"],
  ["ambient-scribes-nejm-ai", "f9e0fa7fd57f87e624c5d63b7b2c3893c174d5c60f2e24670a4315b2223bd8c3"],
  ["china-ai-cal-null", "12ef585871ca9541947964649d3b207c588b62eb094d4f715f3adeb6693f5200"],
  ["columbia-star-birth", "37af80fc76b9e4d805fbe0773ebb21126ee51502d5a5ea2b6ed46c6d625900b7"],
  ["ethiopia-tb-ai-cxr", "16f66fceb3a2e27fbd97c4c2caf9aea94f5df6eec87a70d103eeb0b53c66760f"],
  ["every-cure-repurposing", "8f0dac82f9ee6dc4cd6944e99628416246597b457466a093b7d442271345dc29"],
  ["fido-northumbrian-leaks", "55fa4b7688e7c476719b2734ae1272d57ad9f3aa3f14f44272fe76ebf2d219f3"],
  ["firesat-constellation", "718d5b12ae7648a710c03a0c83c75396e1228ce6d3dc620ddaceff37236fa7ca"],
  ["fortell-ai-hearing-aids", "2efb1b2686480e7694092da6b4fbcd2c683254105e9b74943c61abf163062b33"],
  ["india-tribal-tb-ai-cxr", "fc0860f6f50e8c9e766aecb3d33a3c2f7b5e3693171a8fcc8665b81d589a6eba"],
  ["kenya-ai-consult-null", "34b1a797b7be04b2411340cbb2ffe2155fb5e7b0bd80b4922abd60c58c97388f"],
  ["maryland-ai-tutor-negative", "7ef2f2d6551ba20f13510b49c740a4abc649862620e23b36fee75b9a10571e5f"],
  ["masai-ai-mammography", "3db114833e6e65e08165ca9364e7cf6ee52e15aff980cda9d50082ff28ad6410"],
  ["nhs-derm-skin-cancer", "84a4e76be85d37ed57697375b46df323113cb9e198f4ce187900500e377dc34d"],
  ["nhs-stroke-ai-imaging", "4ddec0861675118c6edcde182e1ecda63b2728d30eb97030b995d4fbfad19bae"],
  ["rentosertib-phase-3", "3a673b276707e3bd47f772b7f7442415456acf973c06d3926885de6aca6064cd"],
  ["tricorder-ai-stethoscope-null", "de20794c08f290b279be4778969acb5f23bbb9e25521c72b0c6e773ac86a6c19"],
  ["ucd-als-speech-bci", "883b88316f0f9996c294f910c7631ccdf7615f9b0cff72be76910e21dea329d8"],
  ["ucla-chart-summarizer-rct", "56270fdaca0b8b660fe64ca5c5477a8480170f60012fa7316b8b38f9d3ece089"],
  ["uva-comet-deterioration-null", "d935a6a817011f0166e48067701320895feda1841a156c64cc9a3a6532fd0f74"],
  ["waymo-injury-crashes", "db1a013d2eb6213042c9af10d6f6873cec87e633367c39db916e7a5b9ab9f5cf"],
]);
export const LEGACY_STRICT_IDS: ReadonlySet<string> = new Set(LEGACY_STRICT.keys());
