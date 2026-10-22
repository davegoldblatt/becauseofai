import type { APIRoute } from "astro";
import { publishable, timeline } from "../../lib/site.ts";
import { renderEntryOg } from "../../og/render.ts";

export function getStaticPaths() {
  return publishable.map((e) => ({ params: { id: e.id }, props: { entry: e } }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderEntryOg(props.entry, timeline);
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
