import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { publishable } from "../lib/site.ts";
import { SITE } from "../site.ts";
import { isoDate } from "../lib/format.ts";

// Newest dates.added first, then editorial rank.
export function GET(context: APIContext) {
  const items = [...publishable]
    .sort((a, b) => {
      const da = isoDate(a.dates.added), db = isoDate(b.dates.added);
      return da < db ? 1 : da > db ? -1 : a.section === b.section ? a.rank - b.rank : a.section.localeCompare(b.section);
    })
    .map((e) => ({
      title: e.headline,
      link: `/entry/${e.id}`,
      pubDate: new Date(isoDate(e.dates.added)),
      description: e.summary,
      categories: [e.section, e.domain],
    }));
  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items,
    customData: "<language>en</language>",
    trailingSlash: false,
  });
}
