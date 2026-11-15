// trigger-deploy — 仅管理员可调用（验证 Supabase JWT + admin_allowlist，按 user_id 查）。
// 触发 GitHub Actions 的 deploy.yml（workflow_dispatch），让静态页内容
//（首页 Hero、关于我 / Now / 联系方式、工具箱）在保存后自动重新部署上线，
// 与文章保存后自动部署的体验一致。
// 依赖的函数 Secrets（与 github-content 共用）：GITHUB_TOKEN（须含 Actions:
// Read and write 权限，2026-11-15 由“OUTAI Edge Function”令牌补加）、
// GITHUB_OWNER、GITHUB_REPO、GITHUB_BRANCH（默认 main）。
// deploy.yml 自带 concurrency group `pages` + cancel-in-progress，短时间内
// 多次保存只会跑最后一次部署，不会堆积。
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
  if (userError || !user) return json({ error: "未登录。" }, 401, cors);

  const { data: allowed, error: allowError } = await userClient
    .from("admin_allowlist").select("user_id").eq("user_id", user.id).maybeSingle();
  if (allowError || !allowed) return json({ error: "无权操作。" }, 403, cors);

  const token = Deno.env.get("GITHUB_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER");
  const repo = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") || "main";
  if (!token || !owner || !repo) {
    return json({ error: "GitHub 函数 Secrets 未配置。" }, 500, cors);
  }

  const url =
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/deploy.yml/dispatches`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "OUTAI-Personal-Space",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: branch }),
    });
  } catch (e) {
    return json({ error: `请求 GitHub 失败：${e instanceof Error ? e.message : String(e)}` }, 502, cors);
  }

  // 成功时 GitHub 返回 204 No Content。
  if (res.status === 204) return json({ ok: true }, 200, cors);

  let detail = "";
  try {
    const data = await res.json() as { message?: string };
    if (data && typeof data.message === "string") detail = data.message;
  } catch {
    detail = await res.text().catch(() => "");
  }
  const hint = res.status === 403
    ? "（令牌可能缺少 Actions 读写权限）"
    : res.status === 422
    ? "（工作流或分支不存在）"
    : "";
  return json(
    { error: `触发部署失败（GitHub ${res.status}）：${detail}${hint}` },
    502,
    cors,
  );
});
