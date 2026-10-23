import { z } from "zod";
import { EntrySchema, SECTIONS, HELD_REASONS, FullDate } from "../../schema.ts";

// JSON Schema for /api/entries.json, generated from the same zod schema the
// build validates entries against, so the two cannot drift. Refinements
// (non-blank strings, calendar-date checks, the grade rules per section) are
// not expressible in JSON Schema and are documented on /method instead.
export function GET() {
  const Counts = z.object(Object.fromEntries(SECTIONS.map((s) => [s, z.number().int()])) as Record<(typeof SECTIONS)[number], z.ZodNumber>);
  const Envelope = z.object({
    site: z.string().describe("Canonical site URL"),
    as_of: z.string().describe("Editorial reference date for the 12-month window (YYYY-MM-DD)"),
    counts: Counts.describe("Published entries per section: a passing cross-vendor verification, a receipt on every number, a primary source"),
    held: z.array(z.object({
      id: z.string(),
      reason: z.enum(HELD_REASONS),
      since: FullDate,
      detail: z.string(),
      record: z.string().optional().describe("Path of the verification record under data/verifications/ in the repository"),
    })).describe("Entries the gate is holding, with the reason: in `entries`, but not rendered, counted, or linked on the site"),
    records: z.string().describe("Where the verification records live"),
    entries: z.array(EntrySchema).describe("Every entry on disk, held ones included"),
  });
  const schema = z.toJSONSchema(Envelope, { target: "draft-2020-12", unrepresentable: "any" });
  const body = {
    $id: "https://becauseofai.org/api/schema.json",
    title: "Because of AI: /api/entries.json",
    description: "A registry of measured AI benefits to people. Each entry is one sentence that must pass four tests and carries three grades (evidence, attribution, window). Grade vocabulary and the four tests: https://becauseofai.org/method",
    ...schema,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/schema+json; charset=utf-8" },
  });
}
