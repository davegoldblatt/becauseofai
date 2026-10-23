import { sectionLists, siteCounts, heldCount } from "../lib/site.ts";
import { SITE } from "../site.ts";
import { GRADE_DESCRIPTION, SECTION_LABEL, fmtRange, fmtDate } from "../lib/format.ts";
import { EVIDENCE, ATTRIBUTION, WINDOW, type Entry } from "../schema.ts";

// /llms.txt (llmstxt.org): a plain-text index of the site for agents and
// language models, built from the same data as the pages. Held entries are
// not listed; the changelog names them with their reason.
function line(e: Entry): string {
  const g = e.grades;
  const grades = g.evidence || g.attribution || g.window
    ? ` Grades: evidence ${g.evidence ?? "none"}, attribution ${g.attribution ?? "none"}, window ${g.window ?? "none"}.`
    : " Not graded yet.";
  const when = e.dates.achieved_start || e.dates.achieved_end
    ? ` Achieved ${fmtRange(e.dates.achieved_start, e.dates.achieved_end)}, published ${fmtDate(e.dates.published)}.`
    : ` Published ${fmtDate(e.dates.published)}.`;
  const impact = e.impact.trim().replace(/[.。]$/, "");
  return `- [${e.headline}](${SITE.url}/entry/${e.id}): ${impact}.${grades}${when}`;
}

export function GET() {
  const out: string[] = [];
  out.push(`# ${SITE.name}`, "");
  out.push(`> ${SITE.description} Every entry is one sentence that starts "Because of AI, …" and has to earn it with a primary source, a comparison, an achieved date (not a publication date), and three grades. Data as of ${SITE.asOf}: ${siteCounts.because} because, ${siteCounts["not-because"]} not because, ${siteCounts["not-yet"]} not yet. Everything is CC BY 4.0: cite "Because of AI (${SITE.domain})" and link the entry.`, "");
  out.push("## The four tests", "", "Every entry must pass all four:", "", "1. The benefit reached actual people.", "2. It was measured against something: a control arm, a baseline, a comparison period.", "3. The AI did something that would not otherwise have happened.", "4. We know when the benefit happened, as opposed to when it was written up.", "");
  out.push("## Three grades, never one score", "");
  for (const v of EVIDENCE) out.push(`- evidence ${v}: ${GRADE_DESCRIPTION.evidence[v]}`);
  for (const v of ATTRIBUTION) out.push(`- attribution ${v}: ${GRADE_DESCRIPTION.attribution[v]}`);
  for (const v of WINDOW) out.push(`- window ${v}: ${GRADE_DESCRIPTION.window[v]}`);
  out.push("", `No human reviews entries. A model from one vendor drafts each entry with a verbatim receipt for every number; a model from a different vendor must independently agree on every receipt and grade from the primary source text, or the entry is held with a public reason. ${heldCount} entries are held today and listed on the changelog; every verification record is in the repository under data/verifications.`, "");
  out.push("## Pages", "", `- [Registry](${SITE.url}/): entries where AI measurably helped people`, `- [Not because of AI](${SITE.url}/not-because-of-ai): what did not work, with the same standard of evidence`, `- [Not yet](${SITE.url}/not-yet): claims that have not passed the four tests, with what would change that`, `- [Method](${SITE.url}/method): the four tests, the grades, achieved versus published`, `- [Changelog](${SITE.url}/changelog): every change to every entry, with the held entries and their reasons`, `- [About](${SITE.url}/about): who runs it, funding, conflicts, contact`, "");
  out.push("## Data", "", `- [All entries as JSON](${SITE.url}/api/entries.json): every field of every entry, held entries listed with their reason`, `- [JSON Schema](${SITE.url}/api/schema.json)`, `- [RSS, one item per entry](${SITE.url}/feed.xml)`, `- [RSS, one item per change](${SITE.url}/changes.xml)`, `- [Sitemap](${SITE.url}/sitemap.xml)`, `- [Source and data on GitHub](${SITE.repo}): code MIT, data and text CC BY 4.0`, "");
  for (const section of ["because", "not-because", "not-yet"] as const) {
    const list = sectionLists[section];
    out.push(`## ${SECTION_LABEL[section]} (${list.length})`, "");
    for (const e of list) out.push(line(e));
    out.push("");
  }
  return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
