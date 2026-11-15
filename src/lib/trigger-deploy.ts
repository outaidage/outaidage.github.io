// trigger-deploy.ts — 静态页内容保存后触发一次 GitHub 重新部署。
// 调用 Supabase Edge Function `trigger-deploy`（管理员 JWT + admin_allowlist
// 校验在函数内完成；GitHub 令牌只存在函数 Secrets 里，绝不进前端）。
// 用在构建时读库的静态内容编辑器（首页 Hero、页面内容、工具箱）：保存后
// 自动部署，约 2 分钟上线，与文章保存后自动部署的体验一致。
// 返回 { ok: true } 或 { ok: false, error }，调用方据此给用户提示；
// 部署触发失败不影响“已保存”本身（改动仍会随下次定时重建上线）。
import { supabase } from "@/lib/supabase";

export async function triggerDeploy(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!supabase) return { ok: false, error: "Supabase 未配置。" };
  try {
    const { data, error } = await supabase.functions.invoke("trigger-deploy", {
      body: {},
    });
    if (error) return { ok: false, error: error.message };
    const d = data as { ok?: boolean; error?: string } | null;
    if (d && d.ok) return { ok: true };
    return { ok: false, error: (d && d.error) || "触发部署失败。" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
