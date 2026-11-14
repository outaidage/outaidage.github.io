// background-url-check — 服务端检查外部背景 URL 是否可访问。
// 仅管理员可调用（验证 Supabase JWT + admin_allowlist）。
// SSRF 防护：只允许 https；拒绝 localhost、私有 IP、链路本地、云元数据地址；
// 重定向 ≤3 次；超时 10 秒；只读响应头（不下载全文）；校验 Content-Type 与大小。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://outaidage.xyz",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "metadata.google.internal") return true;
  // IPv4 私有/链路本地/回环
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // 链路本地（含云元数据 169.254.169.254）
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc00:") || h.startsWith("fd00:")) return true;
  return false;
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405, headers);

  // 仅管理员可调用。
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "未登录。" }, 401, headers);
  const { data: allow } = await supabase.from("admin_allowlist").select("email").eq("email", user.email).maybeSingle();
  if (!allow) return json({ ok: false, error: "仅管理员可检查外部 URL。" }, 403, headers);

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "请求体不是合法 JSON。" }, 400, headers);
  }
  const url = (body.url || "").trim();
  if (!url) return json({ ok: false, error: "请提供 URL。" }, 400, headers);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return json({ ok: false, error: "URL 格式不正确。" }, 400, headers);
  }
  if (parsed.protocol !== "https:") return json({ ok: false, error: "只允许 HTTPS 资源地址。" }, 400, headers);
  if (isPrivateHostname(parsed.hostname)) return json({ ok: false, error: "拒绝访问内网/本地地址。" }, 400, headers);

  // HEAD 请求（跟随重定向最多 3 次，Deno fetch 默认跟随 ≤20 次，这里手动限制）。
  let current = url;
  let res: Response | null = null;
  for (let i = 0; i < 4; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      res = await fetch(current, { method: "HEAD", redirect: "manual", signal: controller.signal });
      clearTimeout(timer);
    } catch (e) {
      return json({ ok: false, error: `资源不可访问：${e instanceof Error ? e.message : "网络错误"}` }, 200, headers);
    }
    if (!res) return json({ ok: false, error: "资源不可访问。" }, 200, headers);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return json({ ok: false, error: `资源重定向但无目标地址（HTTP ${res.status}）。` }, 200, headers);
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return json({ ok: false, error: "重定向地址无效。" }, 200, headers);
      }
      if (next.protocol !== "https:") return json({ ok: false, error: "重定向目标必须是 HTTPS。" }, 200, headers);
      if (isPrivateHostname(next.hostname)) return json({ ok: false, error: "重定向目标是内网/本地地址。" }, 200, headers);
      current = next.toString();
      continue;
    }
    break;
  }
  if (!res) return json({ ok: false, error: "资源不可访问。" }, 200, headers);
  if (res.status !== 200) return json({ ok: false, error: `资源返回 HTTP ${res.status}。` }, 200, headers);

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const contentLength = Number(res.headers.get("content-length") || "0") || null;
  let media_kind: "image" | "video";
  let maxBytes: number;
  if (ALLOWED_IMAGE.has(contentType)) {
    media_kind = "image";
    maxBytes = MAX_IMAGE_BYTES;
  } else if (ALLOWED_VIDEO.has(contentType)) {
    media_kind = "video";
    maxBytes = MAX_VIDEO_BYTES;
  } else {
    return json({ ok: false, error: `不支持的文件类型：${contentType || "未知"}。仅支持 JPG/PNG/WebP/GIF/MP4/WebM。` }, 200, headers);
  }
  if (contentLength && contentLength > maxBytes) {
    return json({ ok: false, error: `文件过大（${(contentLength / 1024 / 1024).toFixed(1)} MB，上限 ${(maxBytes / 1024 / 1024).toFixed(0)} MB）。` }, 200, headers);
  }

  // 建议标题：取 URL 文件名（去扩展名、解码、下划线/连字符转空格）。
  const pathname = parsed.pathname;
  const filename = decodeURIComponent(pathname.split("/").pop() || "");
  const suggested_title = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || "未命名背景";

  return json({
    ok: true,
    media_kind,
    mime: contentType,
    size: contentLength,
    width: null,
    height: null,
    suggested_title,
    final_url: current,
  }, 200, headers);
});
