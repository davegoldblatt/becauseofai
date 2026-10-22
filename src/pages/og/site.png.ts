import type { APIRoute } from "astro";
import { siteCounts } from "../../lib/site.ts";
import { renderSiteOg } from "../../og/render.ts";

export const GET: APIRoute = async () => {
  const png = await renderSiteOg(null, siteCounts);
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
