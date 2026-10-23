import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { publishable } from "../lib/site.ts";
import { SITE } from "../site.ts";
import { isoDate, effectLine, isUnreviewed } from "../lib/format.ts";

// Newest dates.added first, then editorial rank.
export function GET(context: APIContext) {
  const items = [...publishable]
    .sort((a, b) => {
      const da = isoDate(a.dates.added), db = isoDate(b.dates.added);
      return da < db ? 1 : da > db ? -1 : a.section === b.section ? a.rank - b.rank : a.section.localeCompare(b.section);
    })
    .map((e) => {
      const added = isoDate(e.dates.added);
      const effect = effectLine(e);
      return {
        title: e.headline,
        link: `/entry/${e.id}`,
        // Only a complete YYYY-MM-DD becomes a pubDate. A month or year as written
        // is kept as text in the description instead of inventing a day.
        ...(/^\d{4}-\d{2}-\d{2}$/.test(added) ? { pubDate: new Date(`${added}T00:00:00Z`) } : {}),
        description: [e.summary, effect ? `Effect: ${effect}.` : "", /^\d{4}-\d{2}-\d{2}$/.test(added) ? "" : `Added ${added}.`].filter(Boolean).join(" "),
        categories: [e.section, e.domain, ...(isUnreviewed(e) ? ["unreviewed"] : [])],
      };
    });
  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items,
    customData: "<language>en</language>",
    trailingSlash: false,
  });
}
