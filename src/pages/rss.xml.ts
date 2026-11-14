import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isVisiblePost } from "@/lib/blog";

const SITE_URL = process.env.SITE_URL || "https://outaidage.xyz";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async () => {
  const posts = (await getCollection("blog", ({ data }) => isVisiblePost(data)))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, 20);
  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}/`;
      const pub = p.data.pubDate.toUTCString();
      const desc = p.data.description ? `<description>${esc(p.data.description)}</description>` : "";
      const cat = p.data.category ? `<category>${esc(p.data.category)}</category>` : "";
      return `    <item>
      <title>${esc(p.data.title)}</title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${pub}</pubDate>
      ${desc}
      ${cat}
    </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>OUTAI — Personal Digital Space</title>
    <link>${SITE_URL}/</link>
    <description>Explore. Collect. Build. Share. A personal space for technology, AI, the internet and ideas.</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
