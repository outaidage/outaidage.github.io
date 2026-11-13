import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

// User site: outaidage.github.io with custom domain outaidage.xyz
const site = process.env.SITE_URL || "https://outaidage.xyz";

export default defineConfig({
  site,
  base: "/",
  integrations: [react(), tailwind()],
  output: "static"
});
