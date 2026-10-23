// The structured outputs the pipeline asks a model for, as zod schemas (the
// JSON Schema handed to each vendor is derived from these), and the prompts
// that go with them. Three roles: the verifier (second vendor) returns a
// Verdict; the drafter writes Receipts for an existing entry; both vendors
// answer a Dispute.
import { z } from "zod";
import { stringify } from "yaml";
import { EVIDENCE, ATTRIBUTION, WINDOW, RECEIPT_FIELDS, RECEIPT_MAX_WORDS, type Entry } from "../../src/schema.ts";
import { GRADE_DESCRIPTION } from "../../src/lib/format.ts";
import type { QuoteCheck } from "./record.ts";

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

export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

// ---------------------------------------------------------------------------
// Prompts. The vocabulary is read from the same table the site renders, so the
// method page, the stamps, and the models all see one definition per grade.

function vocabulary(asOf: string): string {
  const g = GRADE_DESCRIPTION;
  return [
    "Evidence: " + EVIDENCE.map((k) => `${k} = ${g.evidence[k]}`).join(" "),
    "Attribution: " + ATTRIBUTION.map((k) => `${k} = ${g.attribution[k]}`).join(" "),
    `Window, relative to the twelve months ending ${asOf}: ` + WINDOW.map((k) => `${k} = ${g.window[k]}`).join(" "),
  ].join("\n");
}

const FOUR_TESTS = `The four tests: (1) the benefit reached actual people, not a benchmark score or a demo; (2) it was measured against something: a control arm, a prior period, a human benchmark, another model; (3) the AI was a necessary part of what produced the result; the attribution grade (isolated, only-path, bundled, AI vs AI) records how cleanly its contribution can be separated, so a bundled package that was tested as a package passes this test and is graded bundled, and the test fails only when the AI's part cannot be identified at all; (4) the date the benefit occurred is known, from the methods section, the trial registry, or the body of an operational report, never from an abstract or a press release.`;

const TEXT_NOTE = `The code may cut a long source at a fixed number of characters; a cut is marked in the source tag and does not make the text "not full text". full_text is false only when what you were given is visibly not the document: an abstract without methods and results, a landing page, a snippet, or a cookie or access wall. A complete registry record or report is full text even when it does not contain everything the entry claims; a claim the text does not carry is an unsupported receipt, not a full-text failure.`;

export function verifierSystem(asOf: string): string {
  return `You are the independent verifier for becauseofai.org, a public registry of measured AI benefits to people. A model from a different vendor drafted the entry you are given. You never see its reasoning. You receive the entry's data and the text of its primary source(s), fetched by code. Judge only from that text: not from memory of the study, not from anything else. Do not browse, run commands, or read files.

${FOUR_TESTS}

Grades are a vocabulary, not a formula, and are never combined into one score.
${vocabulary(asOf)}

Sections: "because" is a measured benefit; "not-because" is a measured null or harm, and the four tests apply to the study the same way; "not-yet" is a candidate that has not passed the tests, carries null grades, and is not tested, though its receipts and dates are still checked.

Receipts: each ties one field to a verbatim quote of ${RECEIPT_MAX_WORDS} words or fewer, with a locator and a source index. A receipt supports the NUMBER in its field, nothing more. For every receipt, in the same order, say whether the quote read in context establishes the field's numeric value: supported, contradicted (the source gives a different number or date), or unsupported (the quote does not establish that number, or the number is not in the source). For headline and impact, judge only the numeric claim; the rest of the sentence (what the result means, what has not been measured, what is first or only) is editorial framing that the four tests and the grades cover, not the receipt. The code has already checked whether each quote occurs in the text; a quote marked as not found is unsupported. The achieved dates on an entry are a span; a receipt for a date is supported when the source gives that date at that precision (a month for a month, a day for a day).

Then grade the entry yourself from the source alone, say where the achieved dates can be read, say whether the text is the full document, classify the source, say whether the source shows a conflict of interest and whether the entry states it, and pass or fail the four tests. Where the text does not let you decide, say so in the note and choose the conservative answer: unsupported, false, or null. Be exact and brief.

${TEXT_NOTE}`;
}

export type SourceForPrompt = { index: number; url: string; method: string; sha256: string; text: string; truncated?: boolean };

// The entry as a model sees it: an explicit projection of the parsed fields.
// Never the file text, so notes, history, the drafter's rationale, a previous
// verdict, comments, and anything a quoted key could smuggle stay out.
const MODEL_FIELDS = ["id", "section", "headline", "impact", "impact_number", "impact_label", "summary", "caveat", "domain", "ai_type", "grades", "comparison", "effect", "reach", "dates", "sources", "conflicts", "what_would_change"] as const;
export function entryForModel(e: Entry, opts: { receipts?: boolean } = {}): string {
  const view: Record<string, unknown> = {};
  for (const k of MODEL_FIELDS) if (e[k] !== undefined) view[k] = e[k];
  if (opts.receipts !== false) view.receipts = e.receipts ?? [];
  return stringify(view, { lineWidth: 0, schema: "core" }).trim();
}

export function verifierUser(args: { asOf: string; entryId: string; entryYaml: string; quoteChecks: QuoteCheck[]; sources: SourceForPrompt[] }): string {
  const checks = args.quoteChecks.map((c, i) => `${i + 1}. ${c.field} (source ${c.source}): ${c.found ? "found" : "NOT FOUND"}`).join("\n");
  const sources = args.sources.map((s) => `<source index="${s.index}" url="${s.url}" method="${s.method}" sha256="${s.sha256}"${s.truncated ? ' truncated="true"' : ""}>\n${s.text}\n</source>`).join("\n\n");
  return `<as_of>${args.asOf}</as_of>\n\n<entry id="${args.entryId}">\n${args.entryYaml}\n</entry>\n\n<quote_checks>\n${checks || "(no receipts)"}\n</quote_checks>\n\n${sources}`;
}

export function drafterSystem(): string {
  return `You write receipts for becauseofai.org, a public registry of measured AI benefits to people. A receipt ties one field of an entry to one verbatim fragment of the primary source that supports it, so a reader can check the number against the sentence it came from.

Rules. A receipt supports the number in its field, nothing more: for headline and impact, quote the sentence that carries the number, not every claim in the sentence. Every quote is verbatim from the source text you are given: character for character, including numbers, punctuation, and any typo; never paraphrased, never from memory. ${RECEIPT_MAX_WORDS} words or fewer. Each receipt carries a locator (section, table, figure, page, or registry field) and the index of the source it comes from. A receipt for an achieved date must come from the methods section, the registry record, or the body of a report, never from the abstract or a press release, and the locator says where. Write one receipt per required field; a second for the same field only when the value joins two numbers from two places. A field the text cannot support verbatim goes under unsupported with the reason; never invent or adjust a quote to make it fit. Also write rationale: one sentence naming the comparison that justifies the entry's attribution grade. Never change, grade, or comment on the entry's values.

${FOUR_TESTS}`;
}

export function drafterUser(args: { entryId: string; entryYaml: string; required: string[]; sources: SourceForPrompt[] }): string {
  const sources = args.sources.map((s) => `<source index="${s.index}" url="${s.url}" method="${s.method}">\n${s.text}\n</source>`).join("\n\n");
  return `<entry id="${args.entryId}">\n${args.entryYaml}\n</entry>\n\n<required_fields>\n${args.required.join("\n")}\n</required_fields>\n\n${sources}`;
}

export function disputeSystem(asOf: string): string {
  return `You adjudicate a reader's dispute against an entry on becauseofai.org, a public registry of measured AI benefits to people. You receive the entry, the text of its primary source(s) fetched by code, the dispute, and, when the reader linked one, the text of their source. Judge only from these texts. Do not browse, run commands, or read files.

A dispute is upheld when the entry states something its primary source (or a better primary source the reader brought) does not support: a wrong number, a wrong date, a secondary source labelled primary, a grade the source plainly contradicts under the vocabulary below. A dispute about framing, emphasis, or a grade within reasonable judgment is not upheld. When upheld, list the exact changes: the field's dotted path, the corrected value as it should read on the entry, and for every numeric value a verbatim quote of ${RECEIPT_MAX_WORDS} words or fewer with a locator and source index. Keep reasoning to three sentences, specific to the source.

${FOUR_TESTS}

${vocabulary(asOf)}`;
}

export function disputeUser(args: { asOf: string; entryId: string; entryYaml: string; issue: { number: number; title: string; body: string }; sources: SourceForPrompt[]; disputantSource: SourceForPrompt | null }): string {
  const sources = args.sources.map((s) => `<source index="${s.index}" url="${s.url}" method="${s.method}">\n${s.text}\n</source>`).join("\n\n");
  const extra = args.disputantSource ? `\n\n<source index="-1" url="${args.disputantSource.url}" method="${args.disputantSource.method}" role="disputant">\n${args.disputantSource.text}\n</source>` : "";
  return `<as_of>${args.asOf}</as_of>\n\n<entry id="${args.entryId}">\n${args.entryYaml}\n</entry>\n\n<dispute issue="${args.issue.number}" title="${args.issue.title.replace(/"/g, "'")}">\n${args.issue.body}\n</dispute>\n\n${sources}${extra}`;
}

export function requiredFieldsOf(e: Entry): string[] {
  return RECEIPT_FIELDS.filter((f) => {
    const v = f === "headline" ? e.headline : f === "impact" ? e.impact : f === "impact_number" ? e.impact_number : f === "effect.relative" ? e.effect?.relative : f === "effect.absolute" ? e.effect?.absolute : f === "reach" ? e.reach : f === "dates.achieved_start" ? e.dates.achieved_start : e.dates.achieved_end;
    return v != null && /\d/.test(String(v));
  });
}
