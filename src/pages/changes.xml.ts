import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { publishable } from "../lib/site.ts";
import { SITE } from "../site.ts";
import { isoDate, changeType, isUnreviewed } from "../lib/format.ts";

// One item per history line, newest first (DAV-334). /feed.xml stays one item
// per entry. Only a complete YYYY-MM-DD becomes a pubDate; a month or year as
// written is kept as text instead of inventing a day.
export function GET(context: APIContext) {
  const items = [];
  for (const e of publishable) {
    e.history.forEach((h, i) => {
      const date = isoDate(h.date);
      const ct = changeType(h.note);
      const type = ct ? ct.type[0].toUpperCase() + ct.type.slice(1) : "Change";
      // Each history line gets its own link, and so its own GUID: the entry page
      // anchors #h-1, #h-2, … in the order the lines were written.
      items.push({
        sortKey: `${date}\u0000${e.id}\u0000${String(i).padStart(4, "0")}`,
        title: `${type}: ${e.headline}`,
        link: `/entry/${e.id}#h-${i + 1}`,
        ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { pubDate: new Date(`${date}T00:00:00Z`) } : {}),
        description: [h.note, /^\d{4}-\d{2}-\d{2}$/.test(date) ? "" : `Dated ${date}.`].filter(Boolean).join(" "),
        categories: [ct?.type ?? "change", e.section, ...(isUnreviewed(e) ? ["unreviewed"] : [])],
      });
    });
  }
  items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
  return rss({
    title: `${SITE.name}: changes`,
    description: "Every change to every entry in the registry, one item per change.",
    site: context.site ?? SITE.url,
    items: items.map(({ sortKey: _k, ...it }) => it),
    customData: "<language>en</language>",
    trailingSlash: false,
  });
}
