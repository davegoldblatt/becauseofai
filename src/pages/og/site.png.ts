import type { APIRoute } from "astro";
import { siteCounts, because } from "../../lib/site.ts";
import { renderHomeOg } from "../../og/render.ts";

export const GET: APIRoute = async () => {
  const png = await renderHomeOg(because, siteCounts);
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
