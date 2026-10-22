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
export const DateValue = z.union([
  z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "date must be YYYY, YYYY-MM, or YYYY-MM-DD"),
  z.number().int().min(1900).max(2100),
]);

export const Source = z
  .object({
    title: z.string().min(1),
    url: z.url(),
    type: z.enum(SOURCE_TYPES),
  })
  .strict();

export const Effect = z
  .object({
    relative: z.string().nullable(),
    absolute: z.string().nullable(),
  })
  .strict()
  .nullable();

export const HistoryItem = z
  .object({
    date: DateValue,
    note: z.string().min(1),
  })
  .strict();

export const EntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be a kebab-case slug"),
    section: z.enum(SECTIONS),
    rank: z.number().int().positive(),
    headline: z.string().min(1),
    impact: z.string().min(1),
    summary: z.string().min(1),
    caveat: z.string().nullable(),
    domain: z.enum(DOMAINS),
    ai_type: z.enum(AI_TYPES),
    grades: z
      .object({
        evidence: z.enum(EVIDENCE).nullable(),
        attribution: z.enum(ATTRIBUTION).nullable(),
        window: z.enum(WINDOW).nullable(),
      })
      .strict(),
    comparison: z.string().nullable(),
    effect: Effect,
    reach: z.string().nullable(),
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
    conflicts: z.string().nullable(),
    what_would_change: z.string().nullable(),
    notes: z.string().nullable(),
    related: z.array(z.string()),
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
