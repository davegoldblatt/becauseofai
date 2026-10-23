// The public record of one verification or dispute run. One JSON file per run
// under data/verifications/<entry-id>/<date>.json, committed with the entry, so
// a reader can see what graded what and where the two vendors disagreed.
import type { HeldReason, Vendor } from "../../src/schema.ts";

export type Tokens = { input: number; output: number; total: number; cached?: number; reasoning?: number };

export type SourceFetch = {
  index: number;            // index into the entry's sources[]
  url: string;
  ok: boolean;
  method: string;           // clinicaltrials | europepmc | html | pdf | none
  fetched_at: string;
  final_url?: string;
  sha256?: string;
  chars?: number;
  truncated?: boolean;
  reason?: string;          // why it failed, when ok is false
};

export type QuoteStatus = "supported" | "contradicted" | "stale" | "unsupported";

export type QuoteCheck = {
  field: string;
  source: number;
  quote: string;
  found: boolean;           // the verbatim quote occurs in the fetched text (after whitespace and quote-mark normalisation)
  exact: boolean;           // found without the looser alphanumeric-only comparison
  status: QuoteStatus;      // the code's own status before any model sees the entry
  note?: string;
};

export type Split = { grade: "evidence" | "attribution" | "window"; drafter: string | null; verifier: string | null };

export type Adjudication = {
  result: "published" | "held";
  reason: HeldReason | null;
  detail: string;
  splits?: Split[];
};

export type VendorRunRecord = {
  vendor: Vendor;
  model: string;
  via: string;              // api | codex-login | claude-login
  date: string;
  output: unknown | null;   // the structured output, validated
  error: string | null;
  tokens: Tokens | null;
  duration_ms: number;
};

export type VerificationRecord = {
  version: 1;
  kind: "verification" | "dispute";
  entry: string;
  date: string;
  as_of: string;
  entry_sha256: string;     // sha256 of the entry YAML without the pipeline's own blocks
  drafter: { vendor: Vendor; model: string; date: string } | null;
  sources: SourceFetch[];
  quote_checks: QuoteCheck[];
  verifier: VendorRunRecord | null;
  adjudication: Adjudication;
  dispute?: {
    issue: number;
    title: string;
    claim: string;
    verdicts: VendorRunRecord[];
    outcome: "upheld" | "rejected" | "split";
  };
};
