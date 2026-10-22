// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Static output. `site` is required for absolute URLs in the RSS feed, the
// sitemap, canonical links, and "Cite this entry" blocks.
export default defineConfig({
  site: "https://becauseofai.org",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [sitemap()],
});
