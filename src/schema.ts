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
  if (typeof v !== "string" || /[\s\u0000-\u001f\u007f]/.test(v)) return false;
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
    type: z.enum(SOURCE_TYPES),
  })
  .strict();

export const Effect = z
  .object({
    relative: z.string().nullable(),
    absolute: z.string().nullable(),
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

export const EntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be a kebab-case slug"),
    section: z.enum(SECTIONS),
    rank: z.number().int().positive(),
    headline: NonBlank,
    impact: NonBlank,
    summary: NonBlank,
    caveat: z.string().nullable().optional(),
    domain: z.enum(DOMAINS),
    ai_type: z.enum(AI_TYPES),
    grades: z
      .object({
        evidence: z.enum(EVIDENCE).nullable(),
        attribution: z.enum(ATTRIBUTION).nullable(),
        window: z.enum(WINDOW).nullable(),
      })
      .strict(),
    comparison: z.string().nullable().optional(),
    effect: Effect,
    reach: z.string().nullable().optional(),
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
    conflicts: z.string().nullable().optional(),
    // Required (non-blank) for not-yet, optional elsewhere (HANDOFF §3).
    what_would_change: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    related: z.array(z.string()).optional(),
    history: z.array(HistoryItem).min(1),
  })
  .strict()
  .superRefine((e, ctx) => {
    // Grades are required for because and not-because. not-yet entries have not
    // been graded yet, so all three may be null there (decision 2 on DAV-302).
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
    if (e.section === "not-yet" && !(e.what_would_change ?? "").trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["what_would_change"],
        message: "what_would_change is required for a not-yet entry",
      });
    }
  });

export type Entry = z.infer<typeof EntrySchema>;
export type Section = (typeof SECTIONS)[number];
export type DateLike = z.infer<typeof DateValue>;

export function hasPrimarySource(e: Pick<Entry, "sources">): boolean {
  return e.sources.some((s) => s.type === "primary");
}
