// The shape of a verification record, as the loader checks it before a record
// may bind an entry. Mirrors record.ts; a record that fails this binds nothing.
import { z } from "zod";
import { HELD_REASONS, VENDORS } from "../../src/schema.ts";
import { VerdictSchema } from "./verdict-schema.ts";

const Date_ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Tokens = z.object({ input: z.number(), output: z.number(), total: z.number() }).strict();
export const SourceFetchSchema = z.object({
  index: z.number().int().nonnegative(), url: z.string(), ok: z.boolean(), method: z.string(), fetched_at: z.string(),
  final_url: z.string().optional(), sha256: z.string().optional(), chars: z.number().optional(), truncated: z.boolean().optional(), reason: z.string().optional(),
}).strict();
export const QuoteCheckSchema = z.object({
  field: z.string(), source: z.number().int(), quote: z.string(), found: z.boolean(), exact: z.boolean(),
  status: z.enum(["supported", "contradicted", "stale", "unsupported"]), note: z.string().optional(),
}).strict();
const VendorRunRecordSchema = z.object({
  vendor: z.enum(VENDORS), model: z.string(), via: z.string(), date: Date_, output: z.unknown(), error: z.string().nullable(), tokens: Tokens.nullable(), duration_ms: z.number(),
}).strict();
export const RecordSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["verification", "dispute"]),
  entry: z.string(),
  date: Date_,
  as_of: z.string(),
  entry_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  drafter: z.object({ vendor: z.enum(VENDORS), model: z.string(), date: Date_ }).strict().nullable(),
  sources: z.array(SourceFetchSchema),
  quote_checks: z.array(QuoteCheckSchema),
  verifier: VendorRunRecordSchema.nullable(),
  adjudication: z.object({
    result: z.enum(["published", "held"]), reason: z.enum(HELD_REASONS).nullable(), detail: z.string(),
    splits: z.array(z.object({ grade: z.string(), drafter: z.string().nullable(), verifier: z.string().nullable() }).strict()).optional(),
  }).strict(),
  dispute: z.object({
    issue: z.number().int(), title: z.string(), claim: z.string(), verdicts: z.array(VendorRunRecordSchema), outcome: z.enum(["upheld", "rejected", "split"]),
  }).strict().optional(),
}).strict();
export { VerdictSchema };
