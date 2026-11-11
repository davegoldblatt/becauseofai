// The backfill plan (DAV-475): the past twelve months, cut into slices that one
// run can finish. Deterministic, no model. Slice N is always the same work.
// What is done is read from research/backfill-log.md: a run writes a heading
// "## <date>, slice N: <label>" there, and the heading reaches main only when
// the run's result merges. A run that fails leaves no heading, so its slice
// comes round again. When every slice has a heading the plan is finished and
// the workflow stops calling a model.
//
//   node scripts/backfill-slice.ts --next --salt 12   # the next undone slice (one of the first three, by salt)
//   node scripts/backfill-slice.ts --index 7          # slice 7, whatever the log says
//   node scripts/backfill-slice.ts --count            # how many slices there are
//
// Three kinds:
//   inbox     a fifth of the leads logged in research/inbox.md up to the anchor day
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

// The inbox's lead lines up to the anchor day, oldest first, cut into equal
// parts. Sections dated after the anchor are left out: the inbox keeps growing,
// and a part must hold the same leads on every run.
export function inboxPart(text: string, part: number, of: number): string[] {
  const leads: string[] = [];
  let day = "";
  for (const l of text.split("\n")) {
    const h = /^## (\d{4}-\d{2}-\d{2})/.exec(l);
    if (h) { day = h[1]; continue; }
    if (day && day > ANCHOR) continue;
    if (/^- /.test(l) && /https?:\/\//.test(l) && !/^- (Skipped|Still open|Protocols to watch)/i.test(l)) leads.push(l);
  }
  const size = Math.ceil(leads.length / of);
  return leads.slice((part - 1) * size, part * size);
}

// Slice indexes that have a heading in the log.
export function doneSlices(log: string): Set<number> {
  return new Set([...log.matchAll(/^## .*\bslice (\d+):/gm)].map((m) => Number(m[1])));
}

// The next slice to run: one of the first three that are not done, picked by
// the salt, so a slice that keeps failing cannot hold up the rest. Null when
// the plan is finished.
export function nextSlice(log: string, salt: number): Slice | null {
  const done = doneSlices(log);
  const open = plan().filter((s) => !done.has(s.index)).slice(0, 3);
  return open.length ? open[Math.abs(Math.trunc(salt)) % open.length] : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const slices = plan();
  if (args.includes("--count")) { console.log(slices.length); process.exit(0); }
  const dir0 = path.resolve(process.cwd(), ".scout");
  let slice: Slice | null;
  if (args.includes("--next")) {
    const salt = Number(args[args.indexOf("--salt") + 1] || 0) || 0;
    const log = fs.existsSync("research/backfill-log.md") ? fs.readFileSync("research/backfill-log.md", "utf8") : "";
    slice = nextSlice(log, salt);
    if (!slice) {
      fs.mkdirSync(dir0, { recursive: true });
      fs.writeFileSync(path.join(dir0, "slice.json"), JSON.stringify({ kind: "done", total: slices.length }, null, 2));
      console.log(JSON.stringify({ kind: "done", total: slices.length }));
      process.exit(0);
    }
  } else {
    const n = Number(args[args.indexOf("--index") + 1]);
    if (!args.includes("--index") || !Number.isInteger(n) || n < 0 || n >= slices.length) { console.error(`usage: node scripts/backfill-slice.ts --next [--salt <n>] | --index <0..${slices.length - 1}> | --count`); process.exit(2); }
    slice = slices[n];
  }
  const dir = path.resolve(process.cwd(), ".scout");
  fs.mkdirSync(dir, { recursive: true });
  const out: Record<string, unknown> = { ...slice, total: slices.length, done: doneSlices(fs.existsSync("research/backfill-log.md") ? fs.readFileSync("research/backfill-log.md", "utf8") : "").size };
  if (slice.kind === "inbox") {
    const leads = inboxPart(fs.readFileSync("research/inbox.md", "utf8"), slice.part, slice.of);
    fs.writeFileSync(path.join(dir, "backfill-leads.md"), leads.join("\n") + "\n");
    out.leads = leads.length;
  }
  fs.writeFileSync(path.join(dir, "slice.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
}
