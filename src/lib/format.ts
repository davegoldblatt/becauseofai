// Date and label formatting. Dates keep the precision they were written with:
// "2025-10-25" renders a day, "2025-10" a month, 2019 a year. Nothing is
// invented beyond what the YAML says.
import type { Entry, DateLike } from "../schema.ts";
import { dateToString } from "./entries.ts";

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

// The achieved-date states the seed actually carries (DAV-302, decision 4).
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

// Months between the last known achieved date and the publication date, at the
// precision the YAML gives. Null when either side is missing. Rounded down.
export function publicationLagMonths(e: Entry): number | null {
  const ref = e.dates.achieved_end ?? e.dates.achieved_start;
  const a = parts(ref);
  const b = parts(e.dates.published);
  if (!a || !b) return null;
  const am = (a.m ?? 12) - 1, bm = (b.m ?? 1) - 1; // a: latest month it could mean; b: earliest
  const months = (b.y - a.y) * 12 + (bm - am);
  return months > 0 ? months : 0;
}

// "published 2 yr 9 mo after the benefit" for lags of a year or more; null otherwise.
export function lagLine(e: Entry): string | null {
  const m = publicationLagMonths(e);
  if (m === null || m < 12) return null;
  const y = Math.floor(m / 12), r = m % 12;
  const span = r ? `${y} yr ${r} mo` : `${y} yr`;
  const what = e.dates.achieved_end != null ? "after the benefit ended" : "after the benefit began";
  return `published ${span} ${what}`;
}
