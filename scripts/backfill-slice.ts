// The backfill plan (DAV-475): the past twelve months, cut into slices that one
// run can finish. Deterministic, no model, no state: slice N is always the
// same work, and the workflow takes the next N from its run number, so the
// plan repeats once it has been through.
//
//   node scripts/backfill-slice.ts --index 7     # print slice 7 as JSON, write .scout/slice.json
//   node scripts/backfill-slice.ts --count       # how many slices there are
//
// Three kinds:
//   inbox     a fifth of the leads already logged in research/inbox.md
//   announce  one sector in one quarter: announcements found by web search
//   academic  one week of papers, preprints, and posted trial results
import fs from "node:fs";
import path from "node:path";

// The plan is anchored to a fixed day so a slice means the same window on every run.
const ANCHOR = "2026-11-11";
const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const SECTORS: [string, string][] = [
  ["hospitals and health systems", "hospital, clinic, and health-system deployments: sepsis and deterioration alerts, imaging triage, scribes, scheduling, discharge"],
  ["screening and public health programmes", "national or regional screening and public-health programmes: cancer, TB, diabetic eye disease, stroke pathways"],
  ["emergency response and weather", "wildfire, flood, storm, earthquake, and heat warnings; emergency dispatch and ambulance triage"],
  ["roads, vehicles, rail, and aviation", "driverless and driver-assist fleets, collision avoidance, traffic signals, rail and aviation safety"],
  ["schools and tutoring", "AI tutors and teaching tools used by real students in schools, districts, universities, or national programmes"],
  ["water, power, and buildings", "leak detection, grid operations, outage prediction, building and data-centre energy use"],
  ["accessibility", "vision, hearing, speech, and mobility: hearing aids, speech restoration, navigation aids, captioning in real use"],
  ["government and public services", "benefits, tax, courts, permits, call centres, translation: backlog, waiting time, error rates"],
  ["agriculture and food", "advisory services for farmers, pest and disease detection, irrigation, fisheries, food waste"],
  ["conservation and environment", "anti-poaching, deforestation and illegal-fishing alerts, wildlife monitoring, methane and pollution detection"],
  ["medicines and trials", "AI-discovered or AI-designed drugs and repurposing with results in patients; trial recruitment"],
  ["workplaces and customer service", "field experiments and company reports on AI at work: injuries, hours, resolution rates, earnings"],
];

type Slice =
  | { index: number; kind: "inbox"; part: number; of: number; label: string }
  | { index: number; kind: "announce"; sector: string; scope: string; from: string; to: string; label: string }
  | { index: number; kind: "academic"; from: string; to: string; days: number; label: string };

export function plan(): Slice[] {
  const anchor = new Date(`${ANCHOR}T00:00:00Z`);
  const inbox: Omit<Slice & { kind: "inbox" }, "index">[] = [1, 2, 3, 4, 5].map((part) => ({ kind: "inbox", part, of: 5, label: `inbox leads, part ${part} of 5` }));
  // Four quarters, newest first.
  const announce: Omit<Slice & { kind: "announce" }, "index">[] = [];
  for (let q = 0; q < 4; q++) {
    const to = new Date(anchor.getTime() - q * 91 * DAY), from = new Date(to.getTime() - 91 * DAY);
    for (const [sector, scope] of SECTORS) announce.push({ kind: "announce", sector, scope, from: iso(from), to: iso(to), label: `announcements: ${sector}, ${iso(from)} to ${iso(to)}` });
  }
  // Fifty-two weeks, newest first, ending two days before the anchor (the daily scout covers the rest).
  const academic: Omit<Slice & { kind: "academic" }, "index">[] = [];
  for (let w = 0; w < 52; w++) {
    const to = new Date(anchor.getTime() - (2 + 7 * w) * DAY), from = new Date(to.getTime() - 7 * DAY);
    academic.push({ kind: "academic", from: iso(from), to: iso(to), days: 7, label: `papers and trial results, ${iso(from)} to ${iso(to)}` });
  }
  // The inbox first (leads already found), then announcements and papers in turn.
  const out: Omit<Slice, "index">[] = [...inbox];
  for (let i = 0; i < Math.max(announce.length, academic.length); i++) {
    if (i < announce.length) out.push(announce[i]);
    if (i < academic.length) out.push(academic[i]);
  }
  return out.map((s, index) => ({ ...s, index }) as Slice);
}

// The inbox's lead lines, oldest first, cut into equal parts.
export function inboxPart(text: string, part: number, of: number): string[] {
  const leads = text.split("\n").filter((l) => /^- /.test(l) && /https?:\/\//.test(l) && !/^- (Skipped|Still open|Protocols to watch)/i.test(l));
  const size = Math.ceil(leads.length / of);
  return leads.slice((part - 1) * size, part * size);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const slices = plan();
  if (args.includes("--count")) { console.log(slices.length); process.exit(0); }
  const raw = args[args.indexOf("--index") + 1];
  const n = Number(raw);
  if (!args.includes("--index") || !Number.isInteger(n) || n < 0) { console.error("usage: node scripts/backfill-slice.ts --index <n> | --count"); process.exit(2); }
  const slice = slices[n % slices.length];
  const dir = path.resolve(process.cwd(), ".scout");
  fs.mkdirSync(dir, { recursive: true });
  const out: Record<string, unknown> = { ...slice, total: slices.length };
  if (slice.kind === "inbox") {
    const leads = inboxPart(fs.readFileSync("research/inbox.md", "utf8"), slice.part, slice.of);
    fs.writeFileSync(path.join(dir, "backfill-leads.md"), leads.join("\n") + "\n");
    out.leads = leads.length;
  }
  fs.writeFileSync(path.join(dir, "slice.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
}
