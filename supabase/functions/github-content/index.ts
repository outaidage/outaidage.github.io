import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://outaidage.xyz",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const BLOG_DIR = "src/content/blog";
const PATH_RE = /^src\/content\/blog\/[a-zA-Z0-9_-]+\.md$/;
const MAX_BYTES = 200_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Minimal frontmatter parser for the known schema. The admin writes values
// JSON-encoded (JSON.stringify), so each value is parsed as JSON first and
// falls back to a bare string/boolean.
function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } | { error: string } {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { error: "Content must start with a frontmatter block (---)." };
  }
  const lines = content.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) return { error: "Frontmatter block is not closed with ---." };
  const data: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) return { error: `Bad frontmatter line: ${line}` };
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else value = raw;
    }
    data[key] = value;
  }
  const body = lines.slice(end + 1).join("\n");
  return { data, body };
}

function validateArticle(content: string): string | null {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > MAX_BYTES) return `Article is too large (${bytes} bytes, max ${MAX_BYTES}).`;
  const parsed = parseFrontmatter(content);
  if ("error" in parsed) return parsed.error;
  const { data, body } = parsed;
  const allowed: Record<string, (v: unknown) => boolean> = {
    title: (v) => typeof v === "string" && v.trim().length > 0,
    description: (v) => typeof v === "string",
    pubDate: (v) => typeof v === "string" && isValidDate(v),
    updatedDate: (v) => typeof v === "string" && isValidDate(v),
    category: (v) => typeof v === "string" && v.trim().length > 0,
    tags: (v) => Array.isArray(v) && v.every((t) => typeof t === "string"),
    draft: (v) => typeof v === "boolean",
    cover: (v) => typeof v === "string",
    seoTitle: (v) => typeof v === "string",
    seoDescription: (v) => typeof v === "string",
    featured: (v) => typeof v === "boolean",
  };
  const required = ["title", "pubDate", "category", "draft"];
  for (const key of Object.keys(data)) {
    if (!(key in allowed)) return `Unknown frontmatter field: ${key}.`;
  }
  for (const key of required) {
    if (!(key in data)) return `Missing required frontmatter field: ${key}.`;
  }
  for (const [key, check] of Object.entries(allowed)) {
    if (key in data && !check(data[key])) return `Invalid value for frontmatter field: ${key}.`;
  }
  if (!body.trim()) return "Article body is empty.";
  return null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return new Response("Unauthorized", { status: 401, headers: cors });

  const { data: allowed, error: allowError } = await userClient
    .from("admin_allowlist").select("user_id").eq("user_id", user.id).maybeSingle();
  if (allowError || !allowed) return new Response("Forbidden", { status: 403, headers: cors });

  let payload: { action?: unknown; path?: unknown; content?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: cors });
  }
  const { action, path, content } = payload;

  const token = Deno.env.get("GITHUB_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER");
  const repo = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") || "main";
  if (!token || !owner || !repo) {
    return new Response("GitHub function secrets are not configured", { status: 500, headers: cors });
  }
  const gh = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "OUTAI-Personal-Space",
  };
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents`;

  async function ghJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const text = await res.text();
    let data: unknown = null;
    try { data = JSON.parse(text); } catch { /* keep raw text */ }
    return { res, data, text };
  }

  // --- list: all Markdown files in the blog directory ---
  if (action === "list") {
    const { res, data, text } = await ghJson(
      `${apiBase}/${BLOG_DIR}?ref=${encodeURIComponent(branch)}`, { headers: gh });
    if (!res.ok) return new Response(text, { status: 502, headers: cors });
    const files = (Array.isArray(data) ? data : [])
      .filter((f: { type?: string; name?: string }) => f.type === "file" && f.name?.endsWith(".md"))
      .map((f: { name: string; path: string; sha: string; size: number }) => ({
        name: f.name, slug: f.name.replace(/\.md$/, ""), path: f.path, sha: f.sha, size: f.size,
      }));
    return json({ files }, 200, cors);
  }

  // --- get / delete need a valid blog path ---
  if (typeof path !== "string" || !PATH_RE.test(path)) {
    return new Response("Invalid content path", { status: 400, headers: cors });
  }
  const fileApi = `${apiBase}/${path}`;

  // --- get: fetch one article (decoded Markdown) ---
  if (action === "get") {
    const { res, data, text } = await ghJson(`${fileApi}?ref=${encodeURIComponent(branch)}`, { headers: gh });
    if (res.status === 404) return new Response("Article not found", { status: 404, headers: cors });
    if (!res.ok) return new Response(text, { status: 502, headers: cors });
    const file = data as { sha?: string; content?: string; encoding?: string };
    if (!file.content) return new Response("Unexpected GitHub response", { status: 502, headers: cors });
    const decoded = atob(file.content.replace(/\n/g, ""));
    return json({ path, sha: file.sha, content: decoded }, 200, cors);
  }

  // --- delete: remove one article ---
  if (action === "delete") {
    const { res, data, text } = await ghJson(`${fileApi}?ref=${encodeURIComponent(branch)}`, { headers: gh });
    if (res.status === 404) return new Response("Article not found", { status: 404, headers: cors });
    if (!res.ok) return new Response(text, { status: 502, headers: cors });
    const sha = (data as { sha?: string }).sha;
    if (!sha) return new Response("Unexpected GitHub response", { status: 502, headers: cors });
    const del = await ghJson(fileApi, {
      method: "DELETE",
      headers: { ...gh, "Content-Type": "application/json" },
      body: JSON.stringify({ message: `content: delete ${path}`, sha, branch }),
    });
    if (!del.res.ok) return new Response(del.text, { status: 502, headers: cors });
    const commit = (del.data as { commit?: { sha?: string } })?.commit?.sha;
    return json({ commit, path }, 200, cors);
  }

  // --- upsert: create or update one article (validated) ---
  if (action === "upsert") {
    if (typeof content !== "string") return new Response("Invalid request", { status: 400, headers: cors });
    const problem = validateArticle(content);
    if (problem) return new Response(problem, { status: 400, headers: cors });

    let sha: string | undefined;
    const existing = await ghJson(`${fileApi}?ref=${encodeURIComponent(branch)}`, { headers: gh });
    if (existing.res.ok) {
      sha = (existing.data as { sha?: string }).sha;
    } else if (existing.res.status !== 404) {
      return new Response(existing.text, { status: 502, headers: cors });
    }

    const bytes = new TextEncoder().encode(content);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const body: Record<string, unknown> = {
      message: `content: update ${path}`,
      content: btoa(binary),
      branch,
    };
    if (sha) body.sha = sha;

    const put = await ghJson(fileApi, {
      method: "PUT",
      headers: { ...gh, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!put.res.ok) return new Response(put.text, { status: 502, headers: cors });
    const commit = (put.data as { commit?: { sha?: string } })?.commit?.sha;
    return json({ commit, path }, 200, cors);
  }

  return new Response("Invalid request", { status: 400, headers: cors });
});
