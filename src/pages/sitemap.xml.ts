import { publishable } from "../lib/site.ts";
import { SITE } from "../site.ts";
import { isoDate } from "../lib/format.ts";

// /sitemap.xml with every reader page. Entry pages carry lastmod from dates.updated
// when it is a full date; held entries are not listed.
export function GET() {
  const fixed = ["/", "/not-because-of-ai", "/not-yet", "/method", "/changelog", "/about", "/search"];
  const urls = fixed.map((p) => `  <url><loc>${SITE.url}${p === "/" ? "/" : p}</loc></url>`);
  for (const e of publishable) {
    const u = isoDate(e.dates.updated);
    const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(u) ? `<lastmod>${u}</lastmod>` : "";
    urls.push(`  <url><loc>${SITE.url}/entry/${e.id}</loc>${lastmod}</url>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
