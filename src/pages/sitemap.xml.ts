import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isVisiblePost } from "@/lib/blog";

const SITE_URL = process.env.SITE_URL || "https://outaidage.xyz";

const STATIC_PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/blog/", changefreq: "weekly", priority: "0.9" },
  { path: "/collection/", changefreq: "weekly", priority: "0.8" },
  { path: "/projects/", changefreq: "monthly", priority: "0.7" },
  { path: "/about/", changefreq: "monthly", priority: "0.7" },
  { path: "/now/", changefreq: "weekly", priority: "0.7" },
  { path: "/links/", changefreq: "weekly", priority: "0.7" },
  { path: "/resources/", changefreq: "weekly", priority: "0.7" },
  { path: "/toolbox/", changefreq: "monthly", priority: "0.6" },
  { path: "/guestbook/", changefreq: "weekly", priority: "0.6" },
  { path: "/contact/", changefreq: "monthly", priority: "0.5" },
  { path: "/colophon/", changefreq: "monthly", priority: "0.5" },
  { path: "/bookmarklet/", changefreq: "monthly", priority: "0.5" },
  { path: "/search/", changefreq: "monthly", priority: "0.3" },
];

export const GET: APIRoute = async () => {
  const posts = (await getCollection("blog", ({ data }) => isVisiblePost(data)))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  const urls: string[] = [];
  for (const page of STATIC_PAGES) {
    urls.push(`  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`);
  }
  for (const p of posts) {
    const lastmod = (p.data.updatedDate || p.data.pubDate).toISOString().split("T")[0];
    urls.push(`  <url>
    <loc>${SITE_URL}/blog/${p.slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
