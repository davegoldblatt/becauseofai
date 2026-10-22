// Open Graph images (DAV-341): ink background, the impact number in signal at
// poster size, the sentence in white, three stamps, and the lag bar. Static TTF
// instances of the same families the site uses (satori cannot read variable
// fonts). Not-because cards carry the null-red rule; not-yet cards a WATCHLIST
// stamp. Section and site cards use the nameplate.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import type { Entry, Section } from "../schema.ts";
import { achievedState, fmtDate, splitImpact, lagFor, xOf, earliestDay, yearTicks, isUnreviewed, type Timeline, EVIDENCE_WORD, ATTRIBUTION_LABEL, WINDOW_LABEL } from "../lib/format.ts";
import { latestDay } from "../lib/entries.ts";
import { NAMEPLATE, SITE } from "../site.ts";

// Resolved from the project root: at build time this module runs from a bundled
// chunk under dist/, so import.meta.url would point at the wrong place.
const font = (name: string) => fs.readFileSync(path.resolve(process.cwd(), `src/og/${name}.ttf`));
const FONTS = [
  { name: "Archivo Cond", data: font("ArchivoCond-900"), weight: 900 as const, style: "normal" as const },
  { name: "Bricolage Grotesque", data: font("Bricolage-700"), weight: 700 as const, style: "normal" as const },
  { name: "Archivo", data: font("Archivo-400"), weight: 400 as const, style: "normal" as const },
  { name: "JetBrains Mono", data: font("JetBrainsMono-500"), weight: 500 as const, style: "normal" as const },
];

const INK = "#0e0e0e", PAPER = "#ffffff", SIGNAL = "#ff4f00", NULL_RED = "#b3261e", GRAPHITE = "#8a8a8a", GRAPHITE_T = "#a3a3a3";
const DISPLAY = "Archivo Cond", HEAD = "Bricolage Grotesque", MONO = "JetBrains Mono";

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });
const mono = (fontSize: number, color = GRAPHITE_T, extra: Record<string, unknown> = {}) => ({ fontFamily: MONO, fontSize, color, textTransform: "uppercase", letterSpacing: 1, ...extra });

function stamp(kind: "ev" | "at" | "wi-in" | "wi-ongoing" | "wi-pre" | "wi-none" | "watch" | "unrev", text: string, big?: string): Node {
  const base: Record<string, unknown> = { display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 12px", border: `3px solid ${PAPER}`, color: PAPER, ...mono(16, PAPER) };
  const style: Record<string, unknown> =
    kind === "ev" ? { ...base, backgroundColor: PAPER, color: INK }
    : kind === "wi-in" ? { ...base, backgroundColor: SIGNAL, borderColor: SIGNAL, color: INK }
    : kind === "wi-ongoing" ? { ...base, borderColor: SIGNAL }
    : kind === "wi-pre" ? { ...base, borderColor: GRAPHITE, color: GRAPHITE_T, backgroundImage: `repeating-linear-gradient(135deg, rgba(138,138,138,0.55) 0px, rgba(138,138,138,0.55) 2px, transparent 2px, transparent 9px)` }
    : kind === "wi-none" || kind === "watch" || kind === "unrev" ? { ...base, borderColor: GRAPHITE, color: GRAPHITE_T, borderStyle: "dashed" }
    : base;
  if (kind === "wi-pre") style.padding = "0 5px";
  const children: unknown[] = [];
  if (big) children.push(h("span", { fontFamily: MONO, fontSize: 30, fontWeight: 500, color: kind === "ev" ? INK : PAPER }, big));
  // Pre-window text sits on an opaque ink patch so the hatch never runs under the letters.
  children.push(kind === "wi-pre" ? h("span", { display: "flex", backgroundColor: INK, padding: "3px 7px" }, text) : h("span", { display: "flex" }, text));
  return h("div", style, children);
}

// The nameplate at the largest size that fits `width`, using the measured em
// widths from src/site.ts (plus the gap between the two parts), never wrapping.
function nameplate(section: Section | null, maxSize: number, width: number, color = PAPER): Node {
  const np = NAMEPLATE[section ?? "because"];
  const gapEm = np.pre ? 0.22 : 0;
  const size = Math.min(maxSize, Math.floor(width / (np.em + gapEm)));
  const preColor = section === "not-because" ? NULL_RED : section === "not-yet" ? GRAPHITE_T : color;
  return h("div", { display: "flex", gap: size * gapEm, fontFamily: DISPLAY, fontSize: size, lineHeight: 0.86, color, letterSpacing: -size * 0.01, whiteSpace: "nowrap" }, [
    ...(np.pre ? [h("span", { color: preColor, display: "flex", whiteSpace: "nowrap" }, np.pre)] : []),
    h("span", { display: "flex", whiteSpace: "nowrap" }, np.rest),
  ]);
}

function lagBar(e: Entry, tl: Timeline, width: number): Node {
  const d = e.dates;
  const s = d.achieved_start != null ? String(d.achieved_start) : null;
  const en = d.achieved_end != null ? String(d.achieved_end) : null;
  const px = (x: number) => Math.round((x / 100) * width);
  const xs = s ? xOf(earliestDay(s), tl) : null;
  const xe = en ? xOf(latestDay(en), tl) : null;
  const xp = xOf(earliestDay(String(d.published)), tl);
  const open = s !== null && en === null;
  const ongoing = open && e.grades.window === "ongoing";
  let barL: number | null = null, barR: number | null = null;
  if (xs !== null && xe !== null) { barL = xs; barR = Math.max(xe, xs + 0.6); }
  else if (xs !== null && ongoing) { barL = xs; barR = 100; }
  else if (xs !== null) { barL = xs; barR = Math.min(100, Math.max(xp, xs + 0.6)); }
  else if (xe !== null) { barL = Math.max(0, xe - 0.6); barR = xe; }
  const lag = lagFor(e);
  const gapL = lag ? (lag.ref === "end" ? xe! : xs!) : null;
  const end = tl.end;
  const xb = xOf(new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate() + 1)), tl);
  const AX = 40;
  const kids: Node[] = [
    h("div", { position: "absolute", left: px(xb), top: AX - 16, width: width - px(xb), height: 30, backgroundColor: SIGNAL, opacity: 0.1 }),
    h("div", { position: "absolute", left: 0, top: AX, width, height: 0, borderTop: `2px solid ${GRAPHITE}` }),
    ...yearTicks(tl).map((t, i, arr) => h("div", { position: "absolute", left: i === 0 ? 0 : i === arr.length - 1 ? px(t.x) - 44 : px(t.x) - 22, top: AX + 10, width: 44, display: "flex", justifyContent: i === 0 ? "flex-start" : i === arr.length - 1 ? "flex-end" : "center", ...mono(14) }, String(t.year))),
  ];
  if (barL !== null && barR !== null) kids.push(h("div", { position: "absolute", left: px(barL), top: AX - 5, width: Math.max(4, px(barR) - px(barL)), height: 10, backgroundColor: PAPER, opacity: open && !ongoing ? 0.6 : 1 }));
  if (gapL !== null) kids.push(h("div", { position: "absolute", left: px(gapL), top: AX - 5, width: Math.max(2, px(xp) - px(gapL)), height: 10, backgroundImage: `repeating-linear-gradient(135deg, ${GRAPHITE} 0px, ${GRAPHITE} 2px, transparent 2px, transparent 7px)` }));
  if (lag) kids.push(h("div", { position: "absolute", right: width - px(xp) + 10, top: 0, display: "flex", ...mono(15, PAPER) }, `published ${lag.short} later`));
  kids.push(h("div", { position: "absolute", left: px(xp) - 1, top: AX - 16, width: 0, height: 32, borderLeft: `3px solid ${SIGNAL}` }));
  kids.push(h("div", { position: "absolute", left: xp > 86 ? px(xp) - 50 : px(xp) + 6, top: AX - 16, display: "flex", padding: "2px 6px", backgroundColor: SIGNAL, color: INK, ...mono(13, INK) }, "pub"));
  return h("div", { position: "relative", width, height: 80, display: "flex" }, kids);
}

export async function renderEntryOg(e: Entry, tl: Timeline): Promise<Buffer> {
  const g = e.grades;
  const imp = splitImpact(e.impact);
  const leadSize = !imp.numeric ? (imp.lead.length > 24 ? 72 : 96) : imp.lead.length <= 4 ? 230 : imp.lead.length <= 7 ? 180 : 130;
  const sentenceSize = e.headline.length > 150 ? 30 : e.headline.length > 110 ? 34 : 40;
  const ungraded = g.evidence === null && g.attribution === null && g.window === null;
  const a = achievedState(e);
  const stamps = ungraded
    ? [stamp("watch", "Watchlist")]
    : [
        ...(g.evidence ? [stamp("ev", EVIDENCE_WORD[g.evidence], g.evidence)] : []),
        ...(g.attribution ? [stamp("at", ATTRIBUTION_LABEL[g.attribution])] : []),
        g.window ? stamp(`wi-${g.window}` as "wi-in", WINDOW_LABEL[g.window]) : stamp("wi-none", "window unverified"),
      ];
  if (isUnreviewed(e)) stamps.push(stamp("unrev", "unreviewed"));
  const W = 1200, H = 630, PAD = 56;
  const tree = h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", width: W, height: H, padding: `44px ${PAD}px 40px`, backgroundColor: INK, color: PAPER, position: "relative" }, [
    ...(e.section === "not-because" ? [h("div", { position: "absolute", left: 0, top: 0, width: 16, height: H, backgroundColor: NULL_RED })] : []),
    h("div", { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, [
      nameplate(e.section, 34, 700),
      h("div", { display: "flex", ...mono(18) }, SITE.domain),
    ]),
    h("div", { display: "flex", flexDirection: "column", gap: 14 }, [
      h("div", { display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }, [
        h("div", { display: "flex", fontFamily: DISPLAY, fontSize: leadSize, lineHeight: 0.86, color: SIGNAL, letterSpacing: -leadSize * 0.015, ...(imp.numeric ? {} : { maxWidth: W - 2 * PAD }) }, imp.lead),
        ...(imp.rest ? [h("div", { display: "flex", paddingBottom: 10, maxWidth: 520, ...mono(18, GRAPHITE_T, { lineHeight: 1.3 }) }, imp.rest)] : []),
      ]),
      h("div", { display: "flex", fontFamily: HEAD, fontSize: sentenceSize, lineHeight: 1.12, letterSpacing: -0.7, color: PAPER, maxWidth: W - 2 * PAD }, e.headline),
    ]),
    h("div", { display: "flex", flexDirection: "column", gap: 10 }, [
      h("div", { display: "flex", gap: 10 }, stamps),
      lagBar(e, tl, W - 2 * PAD),
      h("div", { display: "flex", justifyContent: "space-between", ...mono(15) }, [
        h("div", { display: "flex" }, `Achieved ${a.text}`),
        h("div", { display: "flex" }, `Published ${fmtDate(e.dates.published)}`),
      ]),
    ]),
  ]);
  return render(tree);
}

export async function renderSiteOg(section: Section | null, counts: { because: number; "not-because": number; "not-yet": number }): Promise<Buffer> {
  const line = `${SITE.runningHead} · ${counts.because} because · ${counts["not-because"]} not because · ${counts["not-yet"]} not yet`;
  const sub = section === "not-because"
    ? "Measured nulls and negatives, held to the same grades as the wins."
    : section === "not-yet"
      ? "Candidates that have not yet shown a measured benefit, and what would change that."
      : SITE.thesis;
  const tree = h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", width: 1200, height: 630, padding: "52px 56px 44px", backgroundColor: INK, color: PAPER, position: "relative" }, [
    ...(section === "not-because" ? [h("div", { position: "absolute", left: 0, top: 0, width: 16, height: 630, backgroundColor: NULL_RED })] : []),
    h("div", { display: "flex", flexDirection: "column", gap: 24 }, [
      nameplate(section, 196, 1088),
      h("div", { display: "flex", paddingTop: 14, borderTop: `3px solid ${PAPER}`, ...mono(18) }, line),
    ]),
    h("div", { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40 }, [
      h("div", { display: "flex", fontFamily: HEAD, fontSize: 34, lineHeight: 1.12, letterSpacing: -0.5, maxWidth: 860 }, sub),
      h("div", { display: "flex", ...mono(18, SIGNAL) }, SITE.domain),
    ]),
  ]);
  return render(tree);
}

async function render(tree: unknown): Promise<Buffer> {
  const svg = await satori(tree as any, { width: 1200, height: 630, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
