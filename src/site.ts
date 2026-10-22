// Site-wide constants. Change here, never in components.
export const SITE = {
  name: "Because of AI",
  domain: "becauseofai.org",
  url: "https://becauseofai.org",
  thesis:
    "Every entry here reached a human, was measured against something, and names the date it happened — not the date it was published.",
  description: "A registry of measured AI benefits to people, with what did not work and what is not yet proven.",
  // Short form for the running head under the nameplate.
  runningHead: "Measured AI benefits to people",
  // GitHub repository that holds the data. Issue templates for submissions and
  // disputes live there.
  repo: "https://github.com/davegoldblatt/becauseofai",
  // Editorial reference date for the 12-month window. Refreshed only through a
  // reviewed change (DAV-302, decision 6).
  asOf: "2026-10-22",
};

// Nameplate per section. `em` is the measured advance width of the caps string
// in Archivo condensed 900, so the nameplate can be sized to fill its container.
export const NAMEPLATE = {
  because: { pre: "", rest: "BECAUSE OF AI", em: 5.41 },
  "not-because": { pre: "NOT", rest: "BECAUSE OF AI", em: 7.06 },
  "not-yet": { pre: "NOT YET", rest: "BECAUSE OF AI", em: 8.59 },
} as const;
