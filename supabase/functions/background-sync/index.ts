// background-sync — GitHub manifest 资源同步（服务端）。
// 调用方式：管理员手动同步（浏览器传 Supabase JWT + source_id），或
// GitHub Actions 定时任务（传服务端触发密钥 SYNC_TRIGGER_SECRET）。
// 流程：取 manifest.json → 校验结构 → 校验 URL/类型 → 按 source_item_id 比对：
// 新增 → pending_review；更新 → 保留 id 更新字段；重复 → 跳过记日志；
// manifest 里消失的 → 标 broken，不删除。写 background_sync_logs。
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

type ManifestItem = {
  id?: unknown;
  title?: unknown;
  type?: unknown;
  url?: unknown;
  thumbnail?: unknown;
  category?: unknown;
  tags?: unknown;
  author?: unknown;
  source?: unknown;
  license?: unknown;
  attribution?: unknown;
};

function isStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function mediaKindOf(type: string, url: string): "image" | "video" | null {
  const t = type.toLowerCase();
  const lower = url.toLowerCase();
  if (t === "video" || lower.endsWith(".mp4") || lower.endsWith(".webm")) return "video";
  if (t === "image" || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".gif")) return "image";
  return null;
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405, headers);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const triggerSecret = Deno.env.get("SYNC_TRIGGER_SECRET") ?? "";

  // 身份验证：二选一。
  // 1) 管理员 JWT（浏览器手动同步）；2) 服务端触发密钥（GitHub Actions 定时任务）。
  let isAdmin = false;
  const trigger = req.headers.get("x-sync-trigger") || "";
  if (triggerSecret && trigger && trigger === triggerSecret) {
    isAdmin = true;
  } else {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      const { data: allow } = await authClient.from("admin_allowlist").select("user_id").eq("user_id", user.id).maybeSingle();
      if (allow) isAdmin = true;
    }
  }
  if (!isAdmin) return json({ ok: false, error: "未授权：仅管理员或定时任务可触发同步。" }, 401, headers);
  if (!serviceKey) return json({ ok: false, error: "服务端未配置 SUPABASE_SERVICE_ROLE_KEY。" }, 500, headers);

  const admin = createClient(supabaseUrl, serviceKey);

  let body: { source_id?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const sourceId = (body.source_id || "").trim();

  // source_id 为空时同步全部启用的 GitHub manifest 来源（定时任务用）。
  let sourceIds: string[] = [];
  if (sourceId) {
    sourceIds = [sourceId];
  } else {
    const { data: all } = await admin
      .from("background_sources")
      .select("id")
      .eq("kind", "github_manifest")
      .eq("enabled", true);
    sourceIds = (all || []).map((s) => s.id as string);
    if (sourceIds.length === 0) return json({ ok: true, added: 0, updated: 0, duplicates: 0, broken: 0, message: "没有启用的 GitHub manifest 来源。" }, 200, headers);
  }

  // 对每个来源执行一次同步，汇总结果。
  const totals = { added: 0, updated: 0, duplicates: 0, broken: 0 };
  const allErrors: string[] = [];
  for (const sid of sourceIds) {
    const r = await syncOneSource(admin, sid);
    totals.added += r.added;
    totals.updated += r.updated;
    totals.duplicates += r.duplicates;
    totals.broken += r.broken;
    allErrors.push(...r.errors);
  }
  return json({ ok: true, ...totals, errors: allErrors.slice(0, 10) }, 200, headers);
});

async function syncOneSource(admin: ReturnType<typeof createClient>, sourceId: string) {
  const result = { added: 0, updated: 0, duplicates: 0, broken: 0, errors: [] as string[] };

  const { data: source, error: srcErr } = await admin
    .from("background_sources")
    .select("id,name,kind,manifest_url,custom_json_url,enabled")
    .eq("id", sourceId)
    .single();
  if (srcErr || !source) {
    result.errors.push(`资源来源不存在：${sourceId}。`);
    return result;
  }
  if (!source.enabled) {
    result.errors.push(`来源已暂停：${source.name}。`);
    return result;
  }

  const manifestUrl = (source.custom_json_url || source.manifest_url || "").trim();
  if (!manifestUrl) { result.errors.push("该来源没有 manifest 地址。"); return result; }
  if (!/^https:\/\//i.test(manifestUrl)) { result.errors.push("manifest 地址必须是 HTTPS。"); return result; }

  // 创建同步日志行。
  const { data: logRow } = await admin
    .from("background_sync_logs")
    .insert({ source_id: sourceId, status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id as string | undefined;

  async function finishLog(patch: Record<string, unknown>) {
    if (logId) await admin.from("background_sync_logs").update(patch).eq("id", logId);
    await admin.from("background_sources").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: (patch.status as string) || "failed",
    }).eq("id", sourceId);
  }

  // 取 manifest（带超时；GitHub raw 不计 API 限流，优先用 raw 地址）。
  let manifestText: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(manifestUrl, {
      headers: { Accept: "application/json", "User-Agent": "OUTAI-Background-Studio/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 403 || res.status === 429) {
      const msg = `GitHub 返回 ${res.status}（限流或拒绝），已退避，本次不同步。`;
      await finishLog({ status: "failed", finished_at: new Date().toISOString(), error_message: msg });
      result.errors.push(msg);
      return result;
    }
    if (!res.ok) {
      const msg = `manifest 获取失败：HTTP ${res.status}。`;
      await finishLog({ status: "failed", finished_at: new Date().toISOString(), error_message: msg });
      result.errors.push(msg);
      return result;
    }
    manifestText = await res.text();
  } catch (e) {
    const msg = `manifest 获取失败：${e instanceof Error ? e.message : "网络错误"}`;
    await finishLog({ status: "failed", finished_at: new Date().toISOString(), error_message: msg });
    result.errors.push(msg);
    return result;
  }

  let manifest: { name?: unknown; version?: unknown; items?: unknown };
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    const msg = "manifest 不是合法 JSON。";
    await finishLog({ status: "failed", finished_at: new Date().toISOString(), error_message: msg });
    result.errors.push(msg);
    return result;
  }
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.items)) {
    const msg = "manifest 结构无效：需要 items 数组。";
    await finishLog({ status: "failed", finished_at: new Date().toISOString(), error_message: msg });
    result.errors.push(msg);
    return result;
  }

  const items = manifest.items as ManifestItem[];
  const { data: existing } = await admin
    .from("background_assets")
    .select("id,source_item_id,url,title,status")
    .eq("source_id", sourceId);
  const byItemId = new Map<string, { id: string; url: string; title: string; status: string }>();
  for (const row of existing || []) {
    if (row.source_item_id) byItemId.set(row.source_item_id, row as { id: string; url: string; title: string; status: string });
  }

  let added = 0, updated = 0, duplicates = 0, broken = 0;
  const errors: string[] = [];
  const seenItemIds = new Set<string>();

  for (const item of items) {
    if (!isStr(item.id) || !isStr(item.title) || !isStr(item.type) || !isStr(item.url)) {
      errors.push(`跳过无效项：缺少 id/title/type/url（${JSON.stringify(item).slice(0, 120)}）。`);
      continue;
    }
    if (seenItemIds.has(item.id)) {
      duplicates++;
      errors.push(`重复项已跳过：${item.id}。`);
      continue;
    }
    seenItemIds.add(item.id);
    if (!/^https:\/\//i.test(item.url)) {
      errors.push(`跳过 ${item.id}：URL 必须是 HTTPS。`);
      continue;
    }
    const kind = mediaKindOf(item.type, item.url);
    if (!kind) {
      errors.push(`跳过 ${item.id}：无法识别的资源类型 ${item.type} / ${item.url}。`);
      continue;
    }
    const tags = Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === "string") : [];
    const license = isStr(item.license) ? item.license : "";
    const prev = byItemId.get(item.id);
    if (prev) {
      // 更新：保留 id 与状态；URL/标题变了就更新。
      if (prev.url !== item.url || prev.title !== item.title) {
        const { error } = await admin.from("background_assets").update({
          title: item.title,
          url: item.url,
          thumbnail_url: isStr(item.thumbnail) ? item.thumbnail : item.url,
          category: isStr(item.category) ? item.category : "未分类",
          tags,
          author: isStr(item.author) ? item.author : "",
          license,
          attribution: isStr(item.attribution) ? item.attribution : "",
          media_kind: kind,
          updated_at: new Date().toISOString(),
        }).eq("id", prev.id);
        if (error) errors.push(`更新 ${item.id} 失败：${error.message}`);
        else updated++;
      } else {
        duplicates++;
      }
    } else {
      // 新增：进入待审核（管理员审核后启用）；无许可证的同样待审核。
      const assetId = `${sourceId.slice(0, 8)}-${item.id}`;
      const { error } = await admin.from("background_assets").insert({
        id: assetId,
        title: item.title,
        description: "",
        media_kind: kind,
        mime: "",
        url: item.url,
        thumbnail_url: isStr(item.thumbnail) ? item.thumbnail : item.url,
        category: isStr(item.category) ? item.category : "未分类",
        tags,
        source: isStr(item.source) ? item.source : (manifest.name as string) || "GitHub",
        source_url: manifestUrl,
        author: isStr(item.author) ? item.author : "",
        license,
        attribution: isStr(item.attribution) ? item.attribution : "",
        status: "pending_review",
        enabled: true,
        is_featured: false,
        source_id: sourceId,
        source_item_id: item.id,
      });
      if (error) {
        if (error.message.includes("duplicate key")) {
          duplicates++;
        } else {
          errors.push(`新增 ${item.id} 失败：${error.message}`);
        }
      } else {
        added++;
      }
    }
  }

  // 失效检测：库里属于该来源、但 manifest 里已没有的 → 标 broken，不删除。
  for (const [itemId, row] of byItemId) {
    if (!seenItemIds.has(itemId) && row.status !== "broken") {
      const { error } = await admin.from("background_assets").update({
        status: "broken",
        check_error: "该资源已不在来源 manifest 中。",
      }).eq("id", row.id);
      if (!error) broken++;
    }
  }

  const status = errors.length > 0 && added === 0 && updated === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
  await finishLog({
    status,
    finished_at: new Date().toISOString(),
    added,
    updated,
    duplicates,
    broken,
    error_message: errors.length > 0 ? errors.slice(0, 10).join("\n") : null,
    details: { manifest_name: manifest.name, manifest_version: manifest.version, item_count: items.length },
  });

  result.added = added;
  result.updated = updated;
  result.duplicates = duplicates;
  result.broken = broken;
  result.errors = errors;
  return result;
}
