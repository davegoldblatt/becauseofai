// Date and label formatting. Dates keep the precision they were written with:
// "2025-10-25" renders a day, "2025-10" a month, 2019 a year. Nothing is
// invented beyond what the YAML says.
import type { Entry, DateLike, HeldReason, Vendor, ReceiptField, Receipt as ReceiptSchema } from "../schema.ts";
import type { z } from "zod";
import { dateToString, latestDay } from "./entries.ts";
import { SITE } from "../site.ts";
type Receipt = z.infer<typeof ReceiptSchema>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Parts = { y: number; m?: number; d?: number };

export function parts(v: DateLike | null | undefined): Parts | null {
  const s = dateToString(v ?? null);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m || undefined, d: d || undefined };
}

export function fmtDate(v: DateLike | null | undefined): string {
  const p = parts(v);
  if (!p) return "";
  if (p.d) return `${MONTHS[p.m! - 1]} ${p.d}, ${p.y}`;
  if (p.m) return `${MONTHS[p.m - 1]} ${p.y}`;
  return String(p.y);
}

// Short form for tight labels: "Jan 2021", "Mar 20, 2026" stays, a bare year stays.
export function fmtShort(v: DateLike | null | undefined): string {
  const p = parts(v);
  if (!p) return "";
  if (p.d) return `${MONTHS[p.m! - 1]} ${p.d}, ${p.y}`;
  if (p.m) return `${MONTHS[p.m - 1]} ${p.y}`;
  return String(p.y);
}

// ISO-ish form for machine attributes, same precision as written.
export function isoDate(v: DateLike | null | undefined): string {
  return dateToString(v ?? null) ?? "";
}

export function fmtRange(start: DateLike | null | undefined, end: DateLike | null | undefined): string {
  const a = parts(start);
  const b = parts(end);
  if (a && b) {
    if (a.y === b.y) {
      if (a.d && b.d && a.m === b.m) return `${MONTHS[a.m! - 1]} ${a.d}–${b.d}, ${a.y}`;
      if (a.d && b.d) return `${MONTHS[a.m! - 1]} ${a.d} – ${MONTHS[b.m! - 1]} ${b.d}, ${a.y}`;
      if (a.m && b.m && !a.d && !b.d) return a.m === b.m ? `${MONTHS[a.m - 1]} ${a.y}` : `${MONTHS[a.m - 1]}–${MONTHS[b.m - 1]} ${a.y}`;
      if (!a.m && !b.m) return String(a.y);
    }
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  }
  if (a) return fmtDate(start);
  if (b) return fmtDate(end);
  return "";
}

// The achieved-date states the seed actually carries (README, decision 4).
export type AchievedState =
  | { kind: "range"; text: string }
  | { kind: "ongoing"; text: string }
  | { kind: "open"; text: string }
  | { kind: "end-only"; text: string }
  | { kind: "none"; text: string };

export function achievedState(e: Entry): AchievedState {
  const { achieved_start: s, achieved_end: en } = e.dates;
  if (s == null && en == null) {
    return { kind: "none", text: e.section === "not-yet" ? "Benefit not yet demonstrated" : "Dates not yet verified" };
  }
  if (s != null && en == null) {
    if (e.grades.window === "ongoing") return { kind: "ongoing", text: `Ongoing since ${fmtDate(s)}` };
    return { kind: "open", text: `From ${fmtDate(s)}, end not yet verified` };
  }
  if (s == null && en != null) return { kind: "end-only", text: `By ${fmtDate(en)}, start not yet verified` };
  return { kind: "range", text: fmtRange(s, en) };
}

export const SECTION_LABEL: Record<Entry["section"], string> = {
  because: "Because of AI",
  "not-because": "Not because of AI",
  "not-yet": "Not yet",
};

export const SECTION_HREF: Record<Entry["section"], string> = {
  because: "/",
  "not-because": "/not-because-of-ai",
  "not-yet": "/not-yet",
};

export const DOMAIN_LABEL: Record<Entry["domain"], string> = {
  medicine: "Medicine",
  disaster: "Disaster",
  transport: "Transport",
  education: "Education",
  infrastructure: "Infrastructure",
  work: "Work",
  accessibility: "Accessibility",
};

export const AI_TYPE_LABEL: Record<Entry["ai_type"], string> = {
  "classic-ml": "Classic ML",
  generative: "Generative",
  hybrid: "Hybrid",
};

export const EVIDENCE_LABEL: Record<string, string> = {
  A: "A · randomized",
  B: "B · observational",
  C: "C · operational report",
  D: "D · single case",
};

// Descriptor without the letter, for the stamp where the letter is set large.
export const EVIDENCE_WORD: Record<string, string> = {
  A: "randomized",
  B: "observational",
  C: "operational report",
  D: "single case",
};

export const ATTRIBUTION_LABEL: Record<string, string> = {
  isolated: "isolated",
  "only-path": "only path",
  bundled: "bundled",
  "ai-vs-ai": "AI vs AI",
};

export const WINDOW_LABEL: Record<string, string> = {
  in: "in window",
  ongoing: "ongoing",
  pre: "pre-window",
};

// One sentence per grade value. The method page and every stamp tooltip read
// this same table, so the two can never drift.
export const GRADE_DESCRIPTION = {
  evidence: {
    A: "Randomized or cluster-randomized, with a preregistered primary endpoint.",
    B: "Large observational or population-level data with a credible benchmark.",
    C: "A company or government operational report with no independent comparison.",
    D: "A single case or anecdote.",
  },
  attribution: {
    isolated: "The comparison isolates the AI's contribution: the arms differ only by the AI.",
    "only-path": "No human or conventional alternative existed in practice.",
    bundled: "The AI shipped inside a package (tablets, protocols, crews) and the package was tested.",
    "ai-vs-ai": "The control also used AI.",
  },
  window: {
    in: "The benefit occurred inside the last twelve months.",
    ongoing: "It began earlier, is still delivering, and has new in-window data.",
    pre: "The benefit predates the window. Only the publication is new.",
  },
} as const;

export const WATCHLIST_DESCRIPTION = "Not graded yet: this candidate has not passed the four tests. The entry says what would change that.";

export function primarySources(e: Entry) {
  return e.sources.filter((s) => s.type === "primary");
}

export function secondarySources(e: Entry) {
  return e.sources.filter((s) => s.type === "secondary");
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function effectLine(e: Entry): string | null {
  if (!e.effect) return null;
  const rel = e.effect.relative?.trim() || null;
  const abs = e.effect.absolute?.trim() || null;
  if (rel && abs) return `${rel} (${abs})`;
  return rel ?? abs;
}

// ---------------------------------------------------------------------------
// The impact phrase, split into a leading number and the rest, so the number
// can be set at poster size. "82% fewer injury crashes" -> ["82%", " fewer…"].
// A phrase with no leading number keeps its whole text as the lead.
const LEAD = /^([~≈+\-−]?\$?\d[\d,]*(?:\.\d+)?(?:%|×|x|\+|h|k|K|M|B)?)(\s.*|$)/;
export function splitImpact(impact: string): { lead: string; rest: string; numeric: boolean } {
  const m = LEAD.exec(impact.trim());
  if (!m) return { lead: impact.trim(), rest: "", numeric: false };
  return { lead: m[1], rest: m[2].trim(), numeric: true };
}

// The poster number for an entry: the editor's impact_number / impact_label
// when set, otherwise the parsed split. `mod` is a leading modifier glyph
// (~ ≈ + − $) set small next to the number; `num` is the rest of the lead.
export type ImpactParts = { lead: string; mod: string; num: string; rest: string; numeric: boolean };
export function impactParts(e: Entry): ImpactParts {
  const custom = e.impact_number?.trim();
  const base = custom ? { lead: custom, rest: (e.impact_label ?? "").trim(), numeric: true } : splitImpact(e.impact);
  const m = /^([~≈+\-−$]+)(.+)$/.exec(base.lead);
  const numeric = base.numeric && /\d/.test(base.lead);
  return { lead: base.lead, mod: numeric && m ? m[1] : "", num: numeric && m ? m[2] : base.lead, rest: base.rest, numeric };
}

// ---------------------------------------------------------------------------
// Time axis shared by every lag bar on the site.
export type Timeline = { start: Date; end: Date };

// The earliest calendar day a date as written could mean.
export function earliestDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function timelineFor(entries: Entry[], asOf: string): Timeline {
  let startYear = 2019;
  for (const e of entries) {
    for (const v of [e.dates.achieved_start, e.dates.achieved_end, e.dates.published]) {
      const p = parts(v);
      if (p && p.y < startYear) startYear = p.y;
    }
  }
  return { start: new Date(Date.UTC(startYear, 0, 1)), end: latestDay(asOf) };
}

// 0..100 position of a day on the axis, clamped.
export function xOf(d: Date, tl: Timeline): number {
  const span = tl.end.getTime() - tl.start.getTime();
  const x = ((d.getTime() - tl.start.getTime()) / span) * 100;
  return Math.max(0, Math.min(100, x));
}

export function yearTicks(tl: Timeline): { year: number; x: number }[] {
  const out: { year: number; x: number }[] = [];
  for (let y = tl.start.getUTCFullYear(); y <= tl.end.getUTCFullYear(); y++) {
    out.push({ year: y, x: xOf(new Date(Date.UTC(y, 0, 1)), tl) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Publication lag: whole months from the last day the achieved date could mean
// to the first day the published date could mean. Floor, so the gap is never
// overstated. The reference is the achieved end; when the end is unknown and
// the benefit is not graded ongoing, the start; for an ongoing benefit with no
// end there is no lag to report, because the benefit has not finished.
export const LAG_SHOW_MONTHS = 6;

export function lagRef(e: Entry): "end" | "start" | null {
  if (e.dates.achieved_end != null) return "end";
  if (e.dates.achieved_start != null && e.grades.window !== "ongoing") return "start";
  return null;
}

export function lagMonths(e: Entry): number | null {
  const ref = lagRef(e);
  if (!ref) return null;
  const a = parts(ref === "end" ? e.dates.achieved_end : e.dates.achieved_start)!;
  const b = parts(e.dates.published);
  if (!b) return null;
  // Latest month and day the achieved date could mean; earliest the published one could.
  const am = (a.m ?? 12) - 1, bm = (b.m ?? 1) - 1;
  const ad = a.d ?? new Date(Date.UTC(a.y, am + 1, 0)).getUTCDate();
  const bd = b.d ?? 1;
  let months = (b.y - a.y) * 12 + (bm - am);
  if (bd < ad) months -= 1;
  return months > 0 ? months : 0;
}

// Either side written as a bare year: the lag is approximate.
export function lagApprox(e: Entry): boolean {
  const ref = lagRef(e);
  if (!ref) return false;
  const a = parts(ref === "end" ? e.dates.achieved_end : e.dates.achieved_start)!;
  const b = parts(e.dates.published)!;
  return !a.m || !b.m;
}

// "10 mo" below two years, "2.7 yrs" from two years.
export function lagShort(m: number): string {
  if (m < 24) return `${m} mo`;
  const y = m / 12;
  return `${Number.isInteger(y) ? y : y.toFixed(1)} yrs`;
}

// "2 years 8 months", "10 months", "3 years".
export function lagLong(m: number): string {
  const y = Math.floor(m / 12), r = m % 12;
  const ys = y ? `${y} year${y === 1 ? "" : "s"}` : "";
  const ms = r ? `${r} month${r === 1 ? "" : "s"}` : "";
  return [ys, ms].filter(Boolean).join(" ");
}

export type Lag = { months: number; approx: boolean; ref: "end" | "start"; short: string; sentence: string };

export function lagFor(e: Entry): Lag | null {
  const m = lagMonths(e);
  const ref = lagRef(e);
  if (m === null || !ref || m < LAG_SHOW_MONTHS) return null;
  const approx = lagApprox(e);
  const what = ref === "end" ? "after the benefit ended" : "after the benefit began";
  const short = `${approx ? "~" : ""}${lagShort(m)}`;
  // One wording everywhere: the bar says "published 2.7 yrs later",
  // prose and the aria-label say "Published 2.7 yrs after the benefit ended."
  return { months: m, approx, ref, short, sentence: `Published ${short} ${what}.` };
}

// Sort keys for the list pages. Empty strings sort last.
export function achievedKey(e: Entry): string {
  return isoDate(e.dates.achieved_end ?? e.dates.achieved_start ?? null);
}

// ---------------------------------------------------------------------------
// Changelog: a history note's change type. Either a bracketed prefix
// ("[downgraded] …") or a leading verb ("Added.", "Upgraded evidence to A").
// Anything else carries no type. No guessing beyond that.
export const CHANGE_TYPES = ["added", "upgraded", "downgraded", "updated", "corrected", "verified", "removed", "re-graded"] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export function changeType(note: string): { type: ChangeType; rest: string } | null {
  const bracket = /^\[([a-z-]+)\]\s*(.*)$/is.exec(note.trim());
  if (bracket) {
    const t = bracket[1].toLowerCase() as ChangeType;
    if ((CHANGE_TYPES as readonly string[]).includes(t)) return { type: t, rest: bracket[2] };
    return null;
  }
  const verb = /^(added|upgraded|downgraded|updated|corrected|verified|removed|re-?graded)\b[.:,]?\s*(.*)$/is.exec(note.trim());
  if (!verb) return null;
  const t = verb[1].toLowerCase().replace(/^regraded$/, "re-graded") as ChangeType;
  return { type: t, rest: verb[2] };
}

// ---------------------------------------------------------------------------
// Held entries and receipts. One sentence per held reason; the changelog and
// the method page read this table.
export const HELD_REASON_LABEL: Record<HeldReason, string> = {
  ungrounded: "ungrounded",
  "no-full-text": "no full text",
  "grade-split": "grade split",
  "fails-test": "fails test",
  "verification-unavailable": "unverified",
  "no-primary-source": "no primary",
  disputed: "disputed",
};
export const HELD_REASON_DESCRIPTION: Record<HeldReason, string> = {
  ungrounded: "A number on the entry was not supported by a sentence in the primary source.",
  "no-full-text": "The primary source could not be read in full, so nothing on the entry could be checked against it.",
  "grade-split": "The two vendors graded the entry differently and the registry does not vote.",
  "fails-test": "The verifier failed the entry on one of the four tests, or a conflict the source shows is not stated.",
  "verification-unavailable": "The second vendor could not be reached. The registry never publishes on one vendor.",
  "no-primary-source": "There is no primary source, or the only one is a press release or a news article.",
  disputed: "A reader's dispute split the two vendors, so the entry is off the list until they agree.",
};

export const VENDOR_LABEL: Record<Vendor, string> = { anthropic: "Anthropic", openai: "OpenAI" };

export function receiptsFor(e: Entry, ...fields: ReceiptField[]): Receipt[] {
  return (e.receipts ?? []).filter((r) => fields.includes(r.field));
}

// Public URL of a verification record in the repository.
export function recordUrl(record: string): string {
  return `${SITE.repo}/blob/main/data/verifications/${record}`;
}
