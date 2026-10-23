// Entry schema for becauseofai.org. Build fails when an entry violates it.
// Vocabulary comes from HANDOFF.md §3. Keep this file the single source of truth
// for required fields and enums; pages read the parsed, validated entries only.
import { z } from "zod";

export const SECTIONS = ["because", "not-because", "not-yet"] as const;
export const DOMAINS = [
  "medicine",
  "disaster",
  "transport",
  "education",
  "infrastructure",
  "work",
  "accessibility",
] as const;
export const AI_TYPES = ["classic-ml", "generative", "hybrid"] as const;
export const EVIDENCE = ["A", "B", "C", "D"] as const;
export const ATTRIBUTION = ["isolated", "only-path", "bundled", "ai-vs-ai"] as const;
export const WINDOW = ["in", "ongoing", "pre"] as const;
export const SOURCE_TYPES = ["primary", "secondary"] as const;
// The pipeline (DAV-376). Two model vendors take part; the drafter and the
// verifier of a published entry must differ, and the schema enforces that.
export const VENDORS = ["anthropic", "openai"] as const;
export const VERDICTS = ["pass", "fail"] as const;
// Why an entry is held rather than published. The changelog lists every held
// entry with its reason; the adjudicator in scripts/lib/adjudicate.ts is the
// only thing that sets one.
export const HELD_REASONS = [
  "ungrounded",                // a receipt was not supported by the primary source
  "no-full-text",              // the primary source could not be read in full
  "grade-split",               // the drafter and the verifier graded it differently
  "fails-test",                // the verifier failed one of the four tests, or a conflict is unstated
  "verification-unavailable",  // the second vendor could not be reached; never publish on one
  "no-primary-source",         // no primary source, or the only one is a press release
  "disputed",                  // a reader's dispute split the two vendors
] as const;
// Every one of these fields, when set and carrying a digit, needs a receipt
// before the entry can publish.
export const RECEIPT_FIELDS = [
  "headline",
  "impact",
  "impact_number",
  "effect.relative",
  "effect.absolute",
  "reach",
  "dates.achieved_start",
  "dates.achieved_end",
] as const;
export const RECEIPT_MAX_WORDS = 25;

// Dates are kept exactly as written in the YAML: "YYYY-MM-DD", "YYYY-MM", or a
// bare year (which YAML 1.2 reads as an integer). They are never coerced to Date
// objects, so no time-zone shift can move a day.
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// A real calendar date at the written precision. The value is never rewritten.
export function isValidCalendarDate(s: string): boolean {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  if (y < 1900 || y > 2100) return false;
  if (m[2] !== undefined) {
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return false;
    if (m[3] !== undefined) {
      const d = Number(m[3]);
      if (d < 1 || d > daysInMonth(y, mo)) return false;
    }
  }
  return true;
}

export const DateValue = z.union([
  z
    .string()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "date must be YYYY, YYYY-MM, or YYYY-MM-DD")
    .refine(isValidCalendarDate, "not a real calendar date"),
  z.number().int().min(1900).max(2100),
]);

// Required prose must contain something other than whitespace. The stored value
// is not trimmed or changed.
export const NonBlank = z.string().refine((v) => v.trim().length > 0, "must not be blank");

export function isHttpUrl(v: string): boolean {
  if (typeof v !== "string" || /[\s\u0000-\u001f\u007f\\]/.test(v)) return false;
  // Must spell out the authority: "https:example.org" parses, but in an href it
  // resolves against this site instead of pointing at the evidence.
  if (!/^https?:\/\/[^\/?#]+/.test(v)) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0;
}

export const Source = z
  .object({
    title: NonBlank,
    // Only absolute http(s) URLs may qualify as a source. Checked without
    // rewriting: z.url() would trim and normalize the stored value.
    url: z.string().refine(isHttpUrl, "must be an absolute http(s) URL with no whitespace"),
    // Optional DOI, so the daily scout can check Crossref for retractions and
    // corrections. The research run backfills it.
    doi: z.string().regex(/^10\.\d{4,9}\/\S+$/, "DOI must look like 10.xxxx/...").optional(),
    type: z.enum(SOURCE_TYPES),
  })
  .strict();

export const Effect = z
  .object({
    relative: z.string().max(300).nullable(),
    absolute: z.string().max(300).nullable(),
  })
  .strict()
  .nullable()
  .optional();

export const HistoryItem = z
  .object({
    date: DateValue,
    note: NonBlank,
  })
  .strict();

// A pipeline date is always a full day.
export const FullDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .refine(isValidCalendarDate, "not a real calendar date");

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// One number, one verbatim quote from a primary source that supports it.
export const Receipt = z
  .object({
    field: z.enum(RECEIPT_FIELDS),
    quote: NonBlank.max(400).refine((q) => wordCount(q) <= RECEIPT_MAX_WORDS, `quote must be ${RECEIPT_MAX_WORDS} words or fewer`),
    locator: NonBlank.max(300),
    source: z.number().int().nonnegative(),
  })
  .strict();

export const VendorRun = z
  .object({
    vendor: z.enum(VENDORS),
    model: NonBlank.max(120),
    date: FullDate,
  })
  .strict();

// Who wrote the receipts (and, for a new entry, the entry): bound to the file
// so the gate's drafter of record cannot be relabelled by a flag.
export const Drafted = VendorRun.extend({
  via: z.string().max(40).optional(),
  // sha256 of the verifiable content the stamp was made for (see
  // src/lib/entry-text.ts); the gate keeps the stamp only while it matches.
  content: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict();

export const Verification = z
  .object({
    drafter: VendorRun,
    verifier: VendorRun.extend({ verdict: z.enum(VERDICTS) }).strict(),
    // Path under data/verifications/ of the public record of this run.
    record: NonBlank.max(200),
  })
  .strict()
  .refine((v) => v.drafter.vendor !== v.verifier.vendor, {
    message: "the drafter and the verifier must be different vendors",
    path: ["verifier", "vendor"],
  });

export const Held = z
  .object({
    reason: z.enum(HELD_REASONS),
    since: FullDate,
    detail: NonBlank.max(2000),
    record: z.string().max(200).optional(),
    // For reason "disputed": the issue numbers still unresolved. The hold
    // lifts only when this list is empty.
    issues: z.array(z.number().int().positive()).max(50).optional(),
  })
  .strict();

// Generous caps on prose: an amendment or a run can never write a field the
// page cannot show.
const Prose = (max: number) => NonBlank.max(max);

export const EntryObject = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be a kebab-case slug"),
    section: z.enum(SECTIONS),
    rank: z.number().int().positive(),
    headline: Prose(400),
    impact: Prose(120),
    // Optional editorial control of the poster number. When set, the
    // number and its label drive the hero, rows, table, and share image;
    // `impact` stays the citation phrase and the fallback.
    impact_number: z.string().max(40).nullable().optional(),
    impact_label: z.string().max(160).nullable().optional(),
    summary: Prose(1500),
    caveat: z.string().max(1000).nullable().optional(),
    domain: z.enum(DOMAINS),
    ai_type: z.enum(AI_TYPES),
    grades: z
      .object({
        evidence: z.enum(EVIDENCE).nullable(),
        attribution: z.enum(ATTRIBUTION).nullable(),
        window: z.enum(WINDOW).nullable(),
      })
      .strict(),
    comparison: z.string().max(600).nullable().optional(),
    effect: Effect,
    reach: z.string().max(300).nullable().optional(),
    dates: z
      .object({
        achieved_start: DateValue.nullable(),
        achieved_end: DateValue.nullable(),
        published: DateValue,
        added: DateValue,
        updated: DateValue,
      })
      .strict(),
    sources: z.array(Source).min(1),
    conflicts: z.string().max(1500).nullable().optional(),
    // Required (non-blank) for not-yet, optional elsewhere (HANDOFF §3).
    what_would_change: z.string().max(1000).nullable().optional(),
    notes: z.string().max(6000).nullable().optional(),
    related: z.array(z.string()).optional(),
    history: z.array(HistoryItem).min(1),
    // Written by the pipeline, read by the site. `rationale` is the drafter's
    // one line naming the comparison that justifies the attribution grade.
    rationale: z.string().max(600).nullable().optional(),
    receipts: z.array(Receipt).max(40).optional(),
    drafted: Drafted.optional(),
    verification: Verification.optional(),
    held: Held.optional(),
  })
  .strict();

type Ctx = z.RefinementCtx;
type Draft = z.infer<typeof EntryObject>;

// Editorial rules that hold for any entry file, published or not.
function editorialRefine(e: Draft, ctx: Ctx): void {
    // Grades are required for because and not-because. not-yet entries have not
    // been graded yet, so all three may be null there (README, decision 2).
    if (e.section !== "not-yet") {
      for (const key of ["evidence", "attribution"] as const) {
        if (e.grades[key] === null) {
          ctx.addIssue({
            code: "custom",
            path: ["grades", key],
            message: `${key} grade is required for a ${e.section} entry`,
          });
        }
      }
      // window may be null only when the editor has left a verify: note about it.
      if (e.grades.window === null && !/verify:/.test(e.notes ?? "")) {
        ctx.addIssue({
          code: "custom",
          path: ["grades", "window"],
          message: "window grade is required unless notes carry a verify: line",
        });
      }
    }
    // A not-yet entry is a watchlist candidate: ungraded by definition, so the
    // gate does not compare grades on it.
    if (e.section === "not-yet") {
      for (const key of ["evidence", "attribution", "window"] as const) {
        if (e.grades[key] !== null) ctx.addIssue({ code: "custom", path: ["grades", key], message: "a not-yet entry carries no grades" });
      }
    }
    if (e.section === "not-yet" && !(e.what_would_change ?? "").trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["what_would_change"],
        message: "what_would_change is required for a not-yet entry",
      });
    }
}

// The publication state: a passing cross-vendor verification or a held block,
// and full receipt coverage before anything publishes.
function stateRefine(e: Draft, ctx: Ctx): void {

    // An entry is either published (a passing cross-vendor verification) or
    // held. One with neither block is held as unverified (see heldInfo); a
    // failed verification must say why it is held.
    const pass = e.verification?.verifier.verdict === "pass";
    if (e.verification && !pass && !e.held) {
      ctx.addIssue({ code: "custom", path: ["held"], message: "a failed verification must come with a held block" });
    }
    for (const [i, r] of (e.receipts ?? []).entries()) {
      const src = e.sources[r.source];
      if (!src) ctx.addIssue({ code: "custom", path: ["receipts", i, "source"], message: `source ${r.source} does not exist` });
      else if (src.type !== "primary") ctx.addIssue({ code: "custom", path: ["receipts", i, "source"], message: `source ${r.source} is not a primary source` });
    }
    // Full receipt coverage is the gate's condition for a pass; an entry it
    // has not verified yet is not held to it.
    if (isPublished(e) && e.verification) {
      for (const f of missingReceipts(e)) {
        ctx.addIssue({ code: "custom", path: ["receipts"], message: `no receipt for ${f}` });
      }
    }
}

// What the pipeline reads before it has decided: every editorial rule, no state.
export const DraftEntrySchema = EntryObject.superRefine(editorialRefine);
// What the site builds from.
export const EntrySchema = EntryObject.superRefine(editorialRefine).superRefine(stateRefine);

export type Entry = z.infer<typeof EntrySchema>;
export type Section = (typeof SECTIONS)[number];
export type DateLike = z.infer<typeof DateValue>;

export function hasPrimarySource(e: Pick<Entry, "sources">): boolean {
  return e.sources.some((s) => s.type === "primary");
}

export type ReceiptField = (typeof RECEIPT_FIELDS)[number];
export type HeldReason = (typeof HELD_REASONS)[number];
export type Vendor = (typeof VENDORS)[number];

// The value an entry carries at a receipt field, as a string, or null.
export function receiptFieldValue(e: ReceiptFieldSource, field: ReceiptField): string | null {
  switch (field) {
    case "headline": return e.headline;
    case "impact": return e.impact;
    case "impact_number": return e.impact_number ?? null;
    case "effect.relative": return e.effect?.relative ?? null;
    case "effect.absolute": return e.effect?.absolute ?? null;
    case "reach": return e.reach ?? null;
    case "dates.achieved_start": return e.dates.achieved_start == null ? null : String(e.dates.achieved_start);
    case "dates.achieved_end": return e.dates.achieved_end == null ? null : String(e.dates.achieved_end);
  }
}
type ReceiptFieldSource = Pick<Entry, "headline" | "impact" | "impact_number" | "effect" | "reach" | "dates">;

// The receipt fields this entry must cover: every one that is set and carries a digit.
export function requiredReceiptFields(e: ReceiptFieldSource): ReceiptField[] {
  return RECEIPT_FIELDS.filter((f) => {
    const v = receiptFieldValue(e, f);
    return v !== null && /\d/.test(v);
  });
}

export function missingReceipts(e: ReceiptFieldSource & { receipts?: { field: ReceiptField }[] }): ReceiptField[] {
  const have = new Set((e.receipts ?? []).map((r) => r.field));
  return requiredReceiptFields(e).filter((f) => !have.has(f));
}

// Published: a primary source, no held block, and no failed verification. An
// entry the gate has not run on yet stays published; only the gate holds an
// entry, and only by writing a held block. A passing verification is shown on
// the entry page once it has one.
export function isPublished(e: Pick<Entry, "verification" | "held" | "sources">): boolean {
  return hasPrimarySource(e) && !e.held && e.verification?.verifier.verdict !== "fail";
}

// The held block for an entry that is not published. An entry with no primary
// source and no block of its own is held for that reason.
export function heldInfo(e: Pick<Entry, "verification" | "held" | "sources" | "dates">): z.infer<typeof Held> | null {
  if (isPublished(e)) return null;
  if (e.held) return e.held;
  if (!hasPrimarySource(e)) {
    const d = String(e.dates.updated);
    return { reason: "no-primary-source", since: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : `${d.slice(0, 4)}-01-01`, detail: "No primary source yet." };
  }
  const d = String(e.dates.updated);
  return { reason: "verification-unavailable", since: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : `${d.slice(0, 4)}-01-01`, detail: "A failed verification without a held block." };
}
