// The structured outputs the pipeline asks a model for, as zod schemas. The
// JSON Schema handed to each vendor is derived from these, and the loader
// validates a record's stored verdict against the same definition.
import { z } from "zod";
import { EVIDENCE, ATTRIBUTION, WINDOW, RECEIPT_FIELDS, RECEIPT_MAX_WORDS } from "../../src/schema.ts";

export const SOURCE_KINDS = ["paper", "preprint", "registry-record", "verification-report", "operational-report", "program-report", "press-release", "news", "other"] as const;
export const DATE_ORIGINS = ["methods", "results", "registry", "report-body", "abstract", "press-release", "not-found", "not-applicable"] as const;
export const RECEIPT_STATUSES = ["supported", "contradicted", "unsupported"] as const;

const Field = z.enum(RECEIPT_FIELDS);

export const VerdictSchema = z
  .object({
    full_text: z.boolean().describe("true when the text given is the complete document (methods and results, or the whole registry record or report); false for an abstract, a landing page, or a fragment"),
    source_kind: z.enum(SOURCE_KINDS).describe("what the primary source text is"),
    receipts: z
      .array(
        z
          .object({
            field: Field,
            status: z.enum(RECEIPT_STATUSES).describe("supported: the quote, read in context, establishes the field's value. contradicted: the source says something different. unsupported: the quote does not establish the value, or the value is not in the source"),
            note: z.string().describe("one sentence; empty when supported"),
          })
          .strict(),
      )
      .describe("one item per receipt on the entry, in the same order"),
    grades: z
      .object({
        evidence: z.enum(EVIDENCE).nullable(),
        attribution: z.enum(ATTRIBUTION).nullable(),
        window: z.enum(WINDOW).nullable(),
      })
      .strict()
      .describe("your own grades from the source alone; null when the source does not let you decide, or for a not-yet entry"),
    attribution_rationale: z.string().describe("one sentence naming the comparison that justifies your attribution grade"),
    achieved_dates: z
      .object({
        from: z.enum(DATE_ORIGINS).describe("where the entry's achieved dates can be read in the source: methods, results, registry, and report-body are acceptable (the body of the document, at the stated precision); abstract and press-release are not; not-found when the body does not give them; not-applicable when the entry has no achieved dates"),
        note: z.string(),
      })
      .strict(),
    conflict: z
      .object({
        in_source: z.boolean().describe("the source shows a conflict: a company-run study or dashboard, vendor funding, authors employed by or holding equity in the vendor, a patent or licence"),
        stated_in_entry: z.boolean().describe("the entry's conflicts field discloses that conflict"),
        note: z.string(),
      })
      .strict(),
    tests: z
      .object({
        reached_people: z.boolean(),
        measured_against: z.boolean(),
        ai_counterfactual: z.boolean(),
        dated: z.boolean(),
        note: z.string().describe("which test failed and why, or empty"),
      })
      .strict()
      .describe("the four tests, applied to the study for because and not-because entries; all true for a not-yet entry"),
    summary: z.string().describe("two sentences at most: what the source supports and what it does not"),
  })
  .strict();
export type Verdict = z.infer<typeof VerdictSchema>;

export const ReceiptsDraftSchema = z
  .object({
    receipts: z
      .array(
        z
          .object({
            field: Field,
            quote: z.string().describe(`verbatim from the source text, ${RECEIPT_MAX_WORDS} words or fewer`),
            locator: z.string().max(300).describe("section, table, figure, page, or registry field; one short phrase"),
            source: z.number().int().describe("index of the source the quote comes from, as given"),
          })
          .strict(),
      ),
    rationale: z.string().describe("one sentence naming the comparison that justifies the entry's attribution grade"),
    unsupported: z.array(z.object({ field: Field, why: z.string() }).strict()).describe("required fields the text cannot support verbatim"),
  })
  .strict();
export type ReceiptsDraft = z.infer<typeof ReceiptsDraftSchema>;

export const DisputeVerdictSchema = z
  .object({
    upheld: z.boolean(),
    reasoning: z.string().max(1500).describe("three sentences at most, specific to the source"),
    changes: z
      .array(
        z
          .object({
            field: z.string().max(40).describe("dotted path on the entry, for example grades.window, effect.absolute, dates.achieved_start, headline"),
            value: z.string().max(600).nullable().describe("the corrected value, as it should read on the entry"),
            quote: z.string().max(400).describe(`verbatim from a source text given, ${RECEIPT_MAX_WORDS} words or fewer; empty for a grade change`),
            locator: z.string().max(160),
            source: z.number().int().describe("index of the source quoted; -1 for the disputant's source"),
          })
          .strict(),
      )
      .max(12)
      .describe("empty unless upheld"),
  })
  .strict();
export type DisputeVerdict = z.infer<typeof DisputeVerdictSchema>;

