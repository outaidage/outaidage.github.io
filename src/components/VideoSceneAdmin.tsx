// VideoSceneAdmin.tsx — 后台「背景与媒体管理」模块。
// 场景数据存在 Supabase `video_scenes` 表（公开读、管理员写，RLS 保护）。
// 保存后立即生效（前台播放器运行时从 Supabase 读取，无需重新部署）。
// 若表尚未创建（未执行 007 迁移），显示配置说明，不伪造保存成功。
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PLACEHOLDER_SCENES, type VideoScene } from "@/config/video-scenes";

type SceneRow = VideoScene & { is_default: boolean };

type SceneForm = {
  id: string;
  name: string;
  description: string;
  desktopVideoUrl: string;
  mobileVideoUrl: string;
  desktopVideoMp4Url: string;
  mobileVideoMp4Url: string;
  fallbackImage: string;
  enabled: boolean;
  sortOrder: string;
  playbackMode: "loop" | "once";
  overlayOpacity: string;
  overlayColor: string;
  focalPoint: string;
  isDefault: boolean;
};

const emptyForm = (): SceneForm => ({
  id: "",
  name: "",
  description: "",
  desktopVideoUrl: "",
  mobileVideoUrl: "",
  desktopVideoMp4Url: "",
  mobileVideoMp4Url: "",
  fallbackImage: "",
  enabled: true,
  sortOrder: "0",
  playbackMode: "loop",
  overlayOpacity: "0.55",
  overlayColor: "#03040b",
  focalPoint: "50% 50%",
  isDefault: false,
});

const inputClass = "field";
const slugOk = /^[a-z0-9-]+$/;

export default function VideoSceneAdmin({
  say,
  logAudit,
}: {
  say: (kind: "ok" | "err", text: string) => void;
  logAudit: (
    action: string,
    targetType: string | null,
    targetLabel: string | null,
    detail?: string,
  ) => Promise<void>;
}) {
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [form, setForm] = useState<SceneForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<Record<string, string>>({});
  const [checkingUrl, setCheckingUrl] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function loadScenes() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("video_scenes")
      .select(
        "id,name,description,desktop_video_url,mobile_video_url,desktop_video_mp4_url,mobile_video_mp4_url,fallback_image,enabled,sort_order,playback_mode,overlay_opacity,overlay_color,focal_point,is_default,created_at,updated_at",
      )
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) {
      // 表不存在时 Supabase 返回 42P01（relation does not exist）。
      if (error.code === "42P01" || /video_scenes/i.test(error.message)) {
        setTableMissing(true);
      } else {
        say("err", `加载视频场景失败：${error.message}`);
      }
      return;
    }
    setTableMissing(false);
    setScenes(
      ((data || []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        description: String(row.description ?? ""),
        desktopVideoUrl: String(row.desktop_video_url ?? ""),
        mobileVideoUrl: String(row.mobile_video_url ?? ""),
        desktopVideoMp4Url: String(row.desktop_video_mp4_url ?? ""),
        mobileVideoMp4Url: String(row.mobile_video_mp4_url ?? ""),
        fallbackImage: String(row.fallback_image ?? ""),
        enabled: row.enabled !== false,
        sortOrder: Number(row.sort_order ?? 0),
        playbackMode: row.playback_mode === "once" ? "once" : "loop",
        overlayOpacity: Number(row.overlay_opacity ?? 0.55),
        overlayColor: String(row.overlay_color ?? "#03040b"),
        focalPoint: String(row.focal_point ?? "50% 50%"),
        is_default: row.is_default === true,
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
      })),
    );
  }

  useEffect(() => {
    loadScenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toRow(f: SceneForm): Record<string, unknown> {
    return {
      id: f.id.trim(),
      name: f.name.trim(),
      description: f.description.trim() || null,
      desktop_video_url: f.desktopVideoUrl.trim() || null,
      mobile_video_url: f.mobileVideoUrl.trim() || null,
      desktop_video_mp4_url: f.desktopVideoMp4Url.trim() || null,
      mobile_video_mp4_url: f.mobileVideoMp4Url.trim() || null,
      fallback_image: f.fallbackImage.trim() || null,
      enabled: f.enabled,
      sort_order: parseInt(f.sortOrder, 10) || 0,
      playback_mode: f.playbackMode,
      overlay_opacity: Math.min(1, Math.max(0, parseFloat(f.overlayOpacity) || 0.55)),
      overlay_color: f.overlayColor.trim() || "#03040b",
      focal_point: f.focalPoint.trim() || "50% 50%",
      is_default: f.isDefault,
      updated_at: new Date().toISOString(),
    };
  }

  async function saveScene(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const id = form.id.trim();
    if (!slugOk.test(id)) {
      say("err", "场景 ID 只能用小写字母、数字和连字符（如 deep-space）。");
      return;
    }
    if (!form.name.trim()) {
      say("err", "请填写场景名称。");
      return;
    }
    setSaving(true);
    const row = toRow(form);
    if (form.isDefault) {
      await supabase.from("video_scenes").update({ is_default: false }).neq("id", id);
    }
    let error: { message: string } | null = null;
    if (editingId) {
      const res = await supabase.from("video_scenes").update(row).eq("id", editingId);
      error = res.error;
    } else {
      const res = await supabase.from("video_scenes").insert(row);
      error = res.error;
    }
    setSaving(false);
    if (error) {
      say("err", `保存失败：${error.message}`);
      return;
    }
    await logAudit(
      editingId ? "video_scene.update" : "video_scene.create",
      "video_scene",
      form.name.trim(),
      `id=${id}`,
    );
    say("ok", editingId ? "场景已更新（前台立即生效）。" : "场景已添加（前台立即生效）。");
    setForm(emptyForm());
    setEditingId(null);
    loadScenes();
  }

  function editScene(s: SceneRow) {
    setEditingId(s.id);
    setForm({
      id: s.id,
      name: s.name,
      description: s.description,
      desktopVideoUrl: s.desktopVideoUrl,
      mobileVideoUrl: s.mobileVideoUrl,
      desktopVideoMp4Url: s.desktopVideoMp4Url || "",
      mobileVideoMp4Url: s.mobileVideoMp4Url || "",
      fallbackImage: s.fallbackImage,
      enabled: s.enabled,
      sortOrder: String(s.sortOrder),
      playbackMode: s.playbackMode,
      overlayOpacity: String(s.overlayOpacity),
      overlayColor: s.overlayColor,
      focalPoint: s.focalPoint,
      isDefault: s.is_default,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteScene(id: string, name: string) {
    if (!supabase) return;
    const { error } = await supabase.from("video_scenes").delete().eq("id", id);
    if (error) {
      say("err", `删除失败：${error.message}`);
      return;
    }
    await logAudit("video_scene.delete", "video_scene", name, `id=${id}`);
    say("ok", "场景已删除。");
    setConfirmDeleteId(null);
    loadScenes();
  }

  async function setDefault(id: string, name: string) {
    if (!supabase) return;
    await supabase.from("video_scenes").update({ is_default: false }).neq("id", id);
    const { error } = await supabase
      .from("video_scenes")
      .update({ is_default: true })
      .eq("id", id);
    if (error) {
      say("err", `设置默认失败：${error.message}`);
      return;
    }
    await logAudit("video_scene.set_default", "video_scene", name, `id=${id}`);
    say("ok", `已将「${name}」设为默认首页背景。`);
    loadScenes();
  }

  async function toggleEnabled(s: SceneRow) {
    if (!supabase) return;
    const { error } = await supabase
      .from("video_scenes")
      .update({ enabled: !s.enabled })
      .eq("id", s.id);
    if (error) {
      say("err", `切换失败：${error.message}`);
      return;
    }
    say("ok", s.enabled ? `已停用「${s.name}」。` : `已启用「${s.name}」。`);
    loadScenes();
  }

  async function moveScene(s: SceneRow, dir: -1 | 1) {
    if (!supabase) return;
    const ordered = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = ordered.findIndex((x) => x.id === s.id);
    const swapWith = ordered[idx + dir];
    if (!swapWith) return;
    const { error: e1 } = await supabase
      .from("video_scenes")
      .update({ sort_order: swapWith.sortOrder })
      .eq("id", s.id);
    const { error: e2 } = await supabase
      .from("video_scenes")
      .update({ sort_order: s.sortOrder })
      .eq("id", swapWith.id);
    if (e1 || e2) {
      say("err", `调整排序失败：${(e1 || e2)?.message}`);
      return;
    }
    loadScenes();
  }

  async function checkUrl(sceneId: string, url: string) {
    if (!url.trim()) return;
    setCheckingUrl(sceneId);
    try {
      const res = await fetch(url.trim(), { method: "HEAD", mode: "cors" });
      setCheckResult((prev) => ({
        ...prev,
        [sceneId]: res.ok
          ? `可访问（HTTP ${res.status}，${res.headers.get("content-type") || "未知类型"}）`
          : `不可访问（HTTP ${res.status}）`,
      }));
    } catch {
      setCheckResult((prev) => ({
        ...prev,
        [sceneId]:
          "浏览器无法直接检查（可能是 R2 未配置 CORS 或网络问题）。请在新标签页直接打开该链接确认。",
      }));
    } finally {
      setCheckingUrl(null);
    }
  }

  async function seedPlaceholders() {
    if (!supabase) return;
    setSeeding(true);
    const rows = PLACEHOLDER_SCENES.map((s, i) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      desktop_video_url: null,
      mobile_video_url: null,
      desktop_video_mp4_url: null,
      mobile_video_mp4_url: null,
      fallback_image: null,
      enabled: true,
      sort_order: i + 1,
      playback_mode: "loop",
      overlay_opacity: s.overlayOpacity,
      overlay_color: s.overlayColor,
      focal_point: s.focalPoint,
      is_default: s.id === "deep-space",
    }));
    const { error } = await supabase.from("video_scenes").upsert(rows, { onConflict: "id" });
    setSeeding(false);
    if (error) {
      say("err", `导入占位场景失败：${error.message}`);
      return;
    }
    say("ok", "已导入 6 个占位场景（视频地址为空，填入真实 R2 地址后即可播放）。");
    loadScenes();
  }

  if (loading) return <p>正在加载视频场景…</p>;

  if (tableMissing) {
    return (
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3>背景与媒体管理 — 需要先创建数据表</h3>
        <p>
          Supabase 中还没有 <code>video_scenes</code> 表，无法保存场景。
          请在 Supabase Dashboard → SQL Editor 中执行仓库里的迁移文件
          <code> supabase/migrations/007_video_scenes.sql</code>，然后刷新本页。
          该迁移会创建表、行级安全策略，并导入 6 个占位场景。
        </p>
        <p>
          在此之前，前台播放器使用 <code>public/config/video-scenes.json</code>{" "}
          里的静态占位配置（视频地址为空，显示深空渐变回退，不会伪造播放成功）。
        </p>
        <button className="button secondary" type="button" onClick={loadScenes}>
          我已执行迁移，重新检查
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3>背景与媒体管理</h3>
        <p style={{ color: "#929dab", fontSize: 13, lineHeight: 1.7 }}>
          场景保存在 Supabase <code>video_scenes</code> 表，保存后前台立即生效，无需重新部署。
          视频文件请在 Cloudflare R2 自行上传，地址填 R2 公共 URL 或自定义媒体域名
          （<code>https://media.outaidage.xyz/videos/xxx.webm</code>）。
          不要把 R2 Access Key / Secret 写在这里或任何前端代码中。
        </p>
        {scenes.length === 0 ? (
          <button className="button secondary" type="button" onClick={seedPlaceholders} disabled={seeding}>
            {seeding ? "导入中…" : "导入 6 个预置占位场景"}
          </button>
        ) : null}
      </div>

      <form className="card" onSubmit={saveScene} style={{ display: "grid", gap: 10 }}>
        <h3>{editingId ? `编辑场景：${form.name || editingId}` : "新增场景"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input className={inputClass} placeholder="场景 ID（小写+连字符，如 deep-space）" value={form.id} disabled={!!editingId} onChange={(e) => setForm({ ...form, id: e.target.value })} />
          <input className={inputClass} placeholder="场景名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <input className={inputClass} placeholder="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input className={inputClass} type="url" placeholder="桌面端视频 WebM（https://media.outaidage.xyz/videos/xxx.webm）" value={form.desktopVideoUrl} onChange={(e) => setForm({ ...form, desktopVideoUrl: e.target.value })} />
        <input className={inputClass} type="url" placeholder="移动端视频 WebM（更小码率，可留空复用桌面端）" value={form.mobileVideoUrl} onChange={(e) => setForm({ ...form, mobileVideoUrl: e.target.value })} />
        <input className={inputClass} type="url" placeholder="桌面端 MP4 兼容地址（可留空）" value={form.desktopVideoMp4Url} onChange={(e) => setForm({ ...form, desktopVideoMp4Url: e.target.value })} />
        <input className={inputClass} type="url" placeholder="移动端 MP4 兼容地址（可留空）" value={form.mobileVideoMp4Url} onChange={(e) => setForm({ ...form, mobileVideoMp4Url: e.target.value })} />
        <input className={inputClass} type="url" placeholder="封面图 URL（视频加载前与失败时显示，可留空用渐变）" value={form.fallbackImage} onChange={(e) => setForm({ ...form, fallbackImage: e.target.value })} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#929dab" }}>
            排序
            <input className={inputClass} type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#929dab" }}>
            播放模式
            <select className={inputClass} value={form.playbackMode} onChange={(e) => setForm({ ...form, playbackMode: e.target.value as "loop" | "once" })}>
              <option value="loop">循环播放</option>
              <option value="once">播放一次</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#929dab" }}>
            遮罩不透明度（0–1）
            <input className={inputClass} type="number" step="0.05" min="0" max="1" value={form.overlayOpacity} onChange={(e) => setForm({ ...form, overlayOpacity: e.target.value })} />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#929dab" }}>
            遮罩颜色
            <input className={inputClass} value={form.overlayColor} onChange={(e) => setForm({ ...form, overlayColor: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#929dab" }}>
            视频焦点（object-position）
            <input className={inputClass} value={form.focalPoint} onChange={(e) => setForm({ ...form, focalPoint: e.target.value })} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> 启用
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> 设为默认首页背景
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? "保存中…" : editingId ? "保存修改" : "添加场景"}
          </button>
          {editingId ? (
            <button className="button secondary" type="button" onClick={() => { setForm(emptyForm()); setEditingId(null); }}>
              取消编辑
            </button>
          ) : null}
        </div>
      </form>

      <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        {scenes.map((s) => {
          const videoUrl = s.desktopVideoUrl || s.mobileVideoUrl;
          return (
            <div className="card" key={s.id} style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong>{s.name}</strong>
                <span style={{ fontSize: 12, color: "#929dab" }}>
                  {s.is_default ? "★ 默认" : ""} {s.enabled ? "● 启用" : "○ 停用"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#929dab" }}>
                ID：<code>{s.id}</code> · 排序 {s.sortOrder} · {s.playbackMode === "loop" ? "循环" : "一次"}
              </div>
              {s.description ? <p style={{ fontSize: 13 }}>{s.description}</p> : null}
              {previewId === s.id && videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  muted
                  loop
                  playsInline
                  autoPlay
                  style={{ width: "100%", borderRadius: 8, background: "#000" }}
                />
              ) : s.fallbackImage ? (
                <img src={s.fallbackImage} alt={`${s.name} 封面`} style={{ width: "100%", borderRadius: 8 }} />
              ) : (
                <div style={{ height: 90, borderRadius: 8, background: "linear-gradient(135deg,#03040b,#0a1230 55%,#1a0f3c)" }} />
              )}
              <div style={{ fontSize: 12, color: "#929dab", wordBreak: "break-all" }}>
                视频：{videoUrl || "未配置（占位）"}
              </div>
              {checkResult[s.id] ? (
                <div style={{ fontSize: 12, color: "#7dffce" }}>{checkResult[s.id]}</div>
              ) : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {videoUrl ? (
                  <button className="button secondary" type="button" onClick={() => setPreviewId(previewId === s.id ? null : s.id)}>
                    {previewId === s.id ? "关闭预览" : "播放测试"}
                  </button>
                ) : null}
                {videoUrl ? (
                  <button className="button secondary" type="button" disabled={checkingUrl === s.id} onClick={() => checkUrl(s.id, videoUrl)}>
                    {checkingUrl === s.id ? "检查中…" : "检查地址"}
                  </button>
                ) : null}
                <button className="button secondary" type="button" onClick={() => editScene(s)}>编辑</button>
                <button className="button secondary" type="button" onClick={() => toggleEnabled(s)}>
                  {s.enabled ? "停用" : "启用"}
                </button>
                {!s.is_default ? (
                  <button className="button secondary" type="button" onClick={() => setDefault(s.id, s.name)}>设为默认</button>
                ) : null}
                <button className="button secondary" type="button" onClick={() => moveScene(s, -1)}>上移</button>
                <button className="button secondary" type="button" onClick={() => moveScene(s, 1)}>下移</button>
                {confirmDeleteId === s.id ? (
                  <>
                    <button className="button primary" type="button" onClick={() => deleteScene(s.id, s.name)}>确认删除</button>
                    <button className="button secondary" type="button" onClick={() => setConfirmDeleteId(null)}>取消</button>
                  </>
                ) : (
                  <button className="button secondary" type="button" onClick={() => setConfirmDeleteId(s.id)}>删除</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {scenes.length === 0 ? (
        <p style={{ color: "#929dab" }}>还没有场景。点击上方「导入 6 个预置占位场景」，或填写表单新增。</p>
      ) : null}
    </div>
  );
}
