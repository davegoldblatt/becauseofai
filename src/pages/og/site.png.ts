import type { APIRoute } from "astro";
import { renderSiteOg } from "../../og/render.ts";
import { SITE } from "../../site.ts";

export const GET: APIRoute = async () => {
  const png = await renderSiteOg(SITE.thesis);
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
