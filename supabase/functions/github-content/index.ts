// Secure GitHub content writer. Deploy with Supabase CLI.
// Required function secrets: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH.
// Restrict this function to the authenticated admin using the database allowlist.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return new Response("Unauthorized", { status: 401, headers: cors });

  const { data: allowed, error: allowError } = await userClient
    .from("admin_allowlist").select("user_id").eq("user_id", user.id).maybeSingle();
  if (allowError || !allowed) return new Response("Forbidden", { status: 403, headers: cors });

  const { action, path, content } = await req.json();
  if (action !== "upsert" || typeof path !== "string" || typeof content !== "string") {
    return new Response("Invalid request", { status: 400, headers: cors });
  }
  // Only permit Markdown files inside the blog content directory.
  if (!/^src\/content\/blog\/[a-zA-Z0-9_-]+\.md$/.test(path)) {
    return new Response("Invalid content path", { status: 400, headers: cors });
  }

  const token = Deno.env.get("GITHUB_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER");
  const repo = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") || "main";
  if (!token || !owner || !repo) return new Response("GitHub function secrets are not configured", { status: 500, headers: cors });

  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "OUTAI-Personal-Space"
  };
  let sha: string | undefined;
  const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  } else if (existing.status !== 404) {
    return new Response(await existing.text(), { status: 502, headers: cors });
  }

  const bytes = new TextEncoder().encode(content);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  const body: Record<string, unknown> = {
    message: `content: update ${path}`,
    content: btoa(binary),
    branch
  };
  if (sha) body.sha = sha;

  const response = await fetch(api, {
    method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) return new Response(JSON.stringify(result), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ commit: result.commit?.sha, path }), { headers: { ...cors, "Content-Type": "application/json" } });
});
