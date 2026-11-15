// BackgroundStudio.tsx — Background Studio 后台（背景资源管理中心）。
// 分区：资源库 / URL 导入 / GitHub 同步 / 轮换设置 / 统计。
// 资源库：网格/列表切换、搜索/分类筛选/排序/分页、详情预览、立即应用为首页背景、
// 启用/禁用/删除、批量操作。
// R2 上传走 r2-upload-sign Edge Function（服务端签发预签名 URL，文件直传 R2）；
// R2 未配置时函数返回明确错误，上传区如实显示，不伪造上传成功。
// 外部 URL 导入与 GitHub 同步走 Supabase Edge Function（服务端校验 + SSRF 防护）。
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import R2Upload from "./R2Upload";

export type BackgroundAsset = {
  id: string;
  title: string;
  description: string;
  media_kind: "image" | "video";
  mime: string;
  url: string;
  thumbnail_url: string;
  category: string;
  tags: string[];
  source: string;
  source_url: string;
  author: string;
  license: string;
  attribution: string;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  status: string;
  enabled: boolean;
  is_featured: boolean;
  created_at: string;
};

type BgSource = {
  id: string;
  name: string;
  kind: string;
  manifest_url: string;
  custom_json_url: string;
  sync_interval_hours: number;
  last_sync_at: string | null;
  last_sync_status: string | null;
  enabled: boolean;
};

type RotationSettings = {
  mode: string;
  interval_minutes: number;
  category: string | null;
  collection: string | null;
  pinned_asset_id: string | null;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0a0d20",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e6edf3",
  padding: 8,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const STATUS_LABEL: Record<string, string> = {
  pending_review: "待审核",
  active: "已启用",
  disabled: "已停用",
  broken: "异常",
};

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackgroundStudio({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [section, setSection] = useState<"library" | "url" | "github" | "rotation" | "stats">("library");
  const [assets, setAssets] = useState<BackgroundAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [preview, setPreview] = useState<BackgroundAsset | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  // URL 导入表单
  const [urlInput, setUrlInput] = useState("");
  const [urlChecking, setUrlChecking] = useState(false);
  const [urlInfo, setUrlInfo] = useState<{ ok: boolean; media_kind?: string; mime?: string; size?: number; width?: number; height?: number; error?: string } | null>(null);
  const [urlTitle, setUrlTitle] = useState("");
  const [urlCategory, setUrlCategory] = useState("space");
  const [urlAuthor, setUrlAuthor] = useState("");
  const [urlSource, setUrlSource] = useState("");
  const [urlLicense, setUrlLicense] = useState("");

  // GitHub 同步
  const [sources, setSources] = useState<BgSource[]>([]);
  const [srcName, setSrcName] = useState("");
  const [srcManifest, setSrcManifest] = useState("");
  const [srcInterval, setSrcInterval] = useState(6);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<{ id: string; source_id: string; started_at: string; status: string; added: number; updated: number; duplicates: number; broken: number; error_message: string | null }[]>([]);

  // 轮换设置
  const [rotation, setRotation] = useState<RotationSettings>({ mode: "manual", interval_minutes: 30, category: null, collection: null, pinned_asset_id: null });
  const [rotationSaving, setRotationSaving] = useState(false);

  // 统计
  const [stats, setStats] = useState<{ total: number; active: number; pending: number; broken: number; likes: number; favorites: number }>({ total: 0, active: 0, pending: 0, broken: 0, likes: 0, favorites: 0 });

  async function loadAssets() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("background_assets")
      .select("id,title,description,media_kind,mime,url,thumbnail_url,category,tags,source,source_url,author,license,attribution,file_size_bytes,width,height,duration_seconds,status,enabled,is_featured,created_at")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      say("err", `加载资源失败：${error.message}（若表不存在，请先执行 migration 014–016）`);
      return;
    }
    setAssets((data || []) as BackgroundAsset[]);
  }

  async function loadSources() {
    if (!supabase) return;
    const { data } = await supabase.from("background_sources").select("id,name,kind,manifest_url,custom_json_url,sync_interval_hours,last_sync_at,last_sync_status,enabled").order("created_at", { ascending: true });
    if (data) setSources(data as BgSource[]);
    const { data: logs } = await supabase.from("background_sync_logs").select("id,source_id,started_at,status,added,updated,duplicates,broken,error_message").order("started_at", { ascending: false }).limit(20);
    if (logs) setSyncLogs(logs as typeof syncLogs);
  }

  async function loadRotation() {
    if (!supabase) return;
    const { data } = await supabase.from("background_rotation_settings").select("mode,interval_minutes,category,collection,pinned_asset_id").eq("id", "default").single();
    if (data) setRotation(data as RotationSettings);
  }

  async function loadStats() {
    if (!supabase) return;
    const { data: a } = await supabase.from("background_assets").select("status");
    const { count: likes } = await supabase.from("background_likes").select("id", { count: "exact", head: true });
    const { count: favs } = await supabase.from("background_favorites").select("id", { count: "exact", head: true });
    const list = (a || []) as { status: string }[];
    setStats({
      total: list.length,
      active: list.filter((x) => x.status === "active").length,
      pending: list.filter((x) => x.status === "pending_review").length,
      broken: list.filter((x) => x.status === "broken").length,
      likes: likes || 0,
      favorites: favs || 0,
    });
  }

  useEffect(() => {
    loadAssets();
    loadSources();
    loadRotation();
    loadStats();
  }, []);

  const filtered = assets.filter((a) => {
    if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search && !(a.title + a.description + (a.tags || []).join(" ")).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const categories = Array.from(new Set(assets.map((a) => a.category))).sort();
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  async function setAssetStatus(id: string, status: string) {
    if (!supabase) return;
    const { error } = await supabase.from("background_assets").update({ status }).eq("id", id);
    if (error) { say("err", `更新失败：${error.message}`); return; }
    say("ok", `资源状态已改为「${STATUS_LABEL[status] || status}」。`);
    loadAssets();
    loadStats();
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from("background_assets").update({ enabled }).eq("id", id);
    if (error) { say("err", `更新失败：${error.message}`); return; }
    loadAssets();
  }

  async function deleteAsset(id: string, title: string) {
    if (!supabase) return;
    // 应用内确认框（不用 window.confirm：自动化浏览器会自动关掉原生确认框，删除永远执行不了）。
    setConfirm({
      title: "确定删除？",
      message: `确定删除背景「${title}」吗？这会删除数据库记录（R2 上的文件需在 R2 控制台另行删除）。`,
      onConfirm: async () => {
        const { error } = await supabase.from("background_assets").delete().eq("id", id);
        if (error) { say("err", `删除失败：${error.message}`); return; }
        say("ok", `背景「${title}」已删除。`);
        loadAssets();
        loadStats();
      },
    });
  }

  async function applyAsHome(id: string, title: string) {
    if (!supabase) return;
    // 立即应用为首页背景：把该资源设为 featured，并把轮换切为手动 + 锁定该资源。
    await supabase.from("background_assets").update({ is_featured: false }).neq("id", id);
    const { error } = await supabase.from("background_assets").update({ is_featured: true }).eq("id", id);
    if (error) { say("err", `应用失败：${error.message}`); return; }
    await supabase.from("background_rotation_settings").update({ mode: "manual", pinned_asset_id: id }).eq("id", "default");
    say("ok", `「${title}」已设为首页背景（手动固定模式）。`);
    loadAssets();
    loadRotation();
  }

  async function batchSetStatus(status: string) {
    if (!supabase || selected.size === 0) return;
    const { error } = await supabase.from("background_assets").update({ status }).in("id", Array.from(selected));
    if (error) { say("err", `批量更新失败：${error.message}`); return; }
    say("ok", `已将 ${selected.size} 个资源设为「${STATUS_LABEL[status] || status}」。`);
    setSelected(new Set());
    loadAssets();
    loadStats();
  }

  async function batchDelete() {
    if (!supabase || selected.size === 0) return;
    const count = selected.size;
    const ids = Array.from(selected);
    setConfirm({
      title: "确定删除？",
      message: `确定删除选中的 ${count} 个背景吗？此操作不可撤销。`,
      onConfirm: async () => {
        const { error } = await supabase.from("background_assets").delete().in("id", ids);
        if (error) { say("err", `批量删除失败：${error.message}`); return; }
        say("ok", `已删除 ${count} 个背景。`);
        setSelected(new Set());
        loadAssets();
        loadStats();
      },
    });
  }

  async function checkUrl() {
    const url = urlInput.trim();
    if (!url) { say("err", "请先粘贴一个资源 URL。"); return; }
    if (!/^https:\/\//i.test(url)) { say("err", "只允许 HTTPS 资源地址。"); return; }
    setUrlChecking(true);
    setUrlInfo(null);
    try {
      const { data, error } = await supabase!.functions.invoke("background-url-check", { body: { url } });
      setUrlChecking(false);
      if (error) {
        setUrlInfo({ ok: false, error: error.message });
        return;
      }
      setUrlInfo(data as typeof urlInfo);
      if ((data as any)?.ok) {
        if (!urlTitle) setUrlTitle((data as any).suggested_title || "");
      }
    } catch (e) {
      setUrlChecking(false);
      setUrlInfo({ ok: false, error: "检查服务不可用（Edge Function background-url-check 未部署）。" });
    }
  }

  async function saveUrlAsset() {
    if (!supabase) return;
    if (!urlInfo?.ok) { say("err", "请先通过 URL 检查，确认资源可访问。"); return; }
    if (!urlTitle.trim()) { say("err", "请填写标题。"); return; }
    const id = `url-${Date.now().toString(36)}`;
    // 没有明确授权的资源强制待审核。
    const status = urlLicense.trim() ? "active" : "pending_review";
    const { error } = await supabase.from("background_assets").insert({
      id,
      title: urlTitle.trim(),
      description: "",
      media_kind: urlInfo.media_kind || "image",
      mime: urlInfo.mime || "",
      url: urlInput.trim(),
      thumbnail_url: urlInput.trim(),
      category: urlCategory,
      tags: [],
      source: urlSource.trim() || "外部 URL",
      source_url: urlInput.trim(),
      author: urlAuthor.trim(),
      license: urlLicense.trim(),
      attribution: "",
      file_size_bytes: urlInfo.size ?? null,
      width: urlInfo.width ?? null,
      height: urlInfo.height ?? null,
      duration_seconds: null,
      status,
      enabled: true,
      is_featured: false,
      source_id: null,
      source_item_id: null,
    });
    if (error) { say("err", `保存失败：${error.message}`); return; }
    say("ok", status === "active" ? `背景「${urlTitle.trim()}」已保存。` : `背景「${urlTitle.trim()}」已保存（未填授权信息，进入待审核）。`);
    setUrlInput(""); setUrlInfo(null); setUrlTitle(""); setUrlAuthor(""); setUrlSource(""); setUrlLicense("");
    loadAssets();
    loadStats();
  }

  async function addSource() {
    if (!supabase) return;
    if (!srcName.trim() || !srcManifest.trim()) { say("err", "请填写来源名称和 manifest.json 地址。"); return; }
    if (!/^https:\/\//i.test(srcManifest.trim())) { say("err", "manifest 地址必须是 HTTPS。"); return; }
    const { error } = await supabase.from("background_sources").insert({
      name: srcName.trim(),
      kind: "github_manifest",
      manifest_url: srcManifest.trim(),
      sync_interval_hours: srcInterval,
      enabled: true,
    });
    if (error) { say("err", `添加失败：${error.message}`); return; }
    say("ok", `资源来源「${srcName.trim()}」已添加。`);
    setSrcName(""); setSrcManifest("");
    loadSources();
  }

  async function syncSource(sourceId: string, name: string) {
    if (!supabase) return;
    setSyncing(sourceId);
    try {
      const { data, error } = await supabase.functions.invoke("background-sync", { body: { source_id: sourceId } });
      setSyncing(null);
      if (error) {
        say("err", `同步失败：${error.message}（Edge Function background-sync 未部署或同步出错）。`);
        loadSources();
        return;
      }
      const d = data as { added?: number; updated?: number; duplicates?: number; broken?: number; error?: string };
      if (d?.error) { say("err", `同步失败：${d.error}`); }
      else say("ok", `同步完成：新增 ${d?.added ?? 0}，更新 ${d?.updated ?? 0}，重复 ${d?.duplicates ?? 0}，异常 ${d?.broken ?? 0}。新增资源进入待审核。`);
    } catch {
      setSyncing(null);
      say("err", "同步服务不可用（Edge Function background-sync 未部署）。");
    }
    loadSources();
    loadAssets();
    loadStats();
  }

  async function toggleSource(id: string, enabled: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from("background_sources").update({ enabled }).eq("id", id);
    if (error) { say("err", `更新失败：${error.message}`); return; }
    loadSources();
  }

  async function deleteSource(id: string, name: string) {
    if (!supabase) return;
    setConfirm({
      title: "确定删除？",
      message: `确定删除资源来源「${name}」吗？已同步的资源记录会保留（不会删除）。`,
      onConfirm: async () => {
        const { error } = await supabase.from("background_sources").delete().eq("id", id);
        if (error) { say("err", `删除失败：${error.message}`); return; }
        say("ok", `资源来源「${name}」已删除。`);
        loadSources();
      },
    });
  }

  async function saveRotation() {
    if (!supabase) return;
    setRotationSaving(true);
    const { error } = await supabase.from("background_rotation_settings").update({
      mode: rotation.mode,
      interval_minutes: rotation.interval_minutes,
      category: rotation.category || null,
      collection: rotation.collection || null,
      pinned_asset_id: rotation.pinned_asset_id || null,
    }).eq("id", "default");
    setRotationSaving(false);
    if (error) { say("err", `保存失败：${error.message}`); return; }
    say("ok", "轮换设置已保存。");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([["library", "背景资源库"], ["url", "外部 URL 导入"], ["github", "GitHub 仓库同步"], ["rotation", "自动轮换设置"], ["stats", "喜欢和收藏统计"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`button ${section === k ? "primary" : "secondary"}`} onClick={() => setSection(k)}>{label}</button>
        ))}
        <button type="button" className="button secondary" onClick={() => { loadAssets(); loadSources(); loadRotation(); loadStats(); }}>刷新全部数据</button>
      </div>

      {section === "library" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...inputStyle, flex: "1 1 200px" }} placeholder="搜索标题、描述、标签…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }} style={{ ...inputStyle, width: "auto" }}>
              <option value="all">全部分类</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }} style={{ ...inputStyle, width: "auto" }}>
              <option value="all">全部状态</option>
              <option value="active">已启用</option>
              <option value="pending_review">待审核</option>
              <option value="disabled">已停用</option>
              <option value="broken">异常</option>
            </select>
            <button type="button" className="button secondary" onClick={() => setView(view === "grid" ? "list" : "grid")}>{view === "grid" ? "列表视图" : "网格视图"}</button>
          </div>
          {selected.size > 0 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#aab3c0" }}>
              <span>已选 {selected.size} 个</span>
              <button type="button" className="button secondary" onClick={() => batchSetStatus("active")}>批量启用</button>
              <button type="button" className="button secondary" onClick={() => batchSetStatus("disabled")}>批量停用</button>
              <button type="button" className="button secondary" onClick={batchDelete} style={{ color: "#f28b82" }}>批量删除</button>
              <button type="button" className="button secondary" onClick={() => setSelected(new Set())}>取消选择</button>
            </div>
          ) : null}
          {loading ? <p style={{ fontSize: 12, color: "#929dab" }}>正在加载资源…</p> : null}
          {!loading && filtered.length === 0 ? (
            <div className="card"><p style={{ margin: 0 }}>还没有背景资源。通过「外部 URL 导入」添加、GitHub 同步自动导入，或在「通过 URL 添加背景」下方的 R2 上传区上传文件。</p></div>
          ) : null}
          <div style={view === "grid" ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 } : { display: "grid", gap: 8 }}>
            {pageItems.map((a) => (
              <div key={a.id} className="card" style={{ padding: view === "grid" ? 10 : 8, display: "grid", gap: 8, minWidth: 0, overflow: "hidden" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#929dab", minWidth: 0, overflow: "hidden" }}>
                  <input type="checkbox" checked={selected.has(a.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(a.id); else s.delete(a.id); setSelected(s); }} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.id}>{a.id}</span>
                </label>
                <button type="button" onClick={() => setPreview(a)} style={{ border: 0, padding: 0, background: "none", cursor: "pointer", textAlign: "left" }}>
                  {a.media_kind === "video" ? (
                    <video src={a.url} poster={a.thumbnail_url || undefined} muted playsInline style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, background: "#0a0d20" }} />
                  ) : (
                    <img src={a.thumbnail_url || a.url} alt={a.title} loading="lazy" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, background: "#0a0d20" }} />
                  )}
                </button>
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <strong style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.title}>{a.title}</strong>
                  <span style={{ fontSize: 11, color: a.status === "active" ? "#7dffce" : a.status === "broken" ? "#f28b82" : "#f2c94c", marginLeft: 6 }}>{STATUS_LABEL[a.status] || a.status}</span>
                  {a.is_featured ? <span style={{ fontSize: 11, color: "#f2c94c", marginLeft: 6 }}>★ 首页背景</span> : null}
                </div>
                <div style={{ fontSize: 11, color: "#929dab", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.category} · {a.media_kind === "video" ? "视频" : "图片"} · {formatBytes(a.file_size_bytes)}{a.width ? ` · ${a.width}×${a.height}` : ""}{a.duration_seconds ? ` · ${Math.round(a.duration_seconds)}s` : ""}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
                  <button type="button" className="button secondary" onClick={() => setPreview(a)}>预览</button>
                  <button type="button" className="button secondary" onClick={() => applyAsHome(a.id, a.title)}>设为首页背景</button>
                  {a.status === "pending_review" ? <button type="button" className="button secondary" onClick={() => setAssetStatus(a.id, "active")}>通过审核</button> : null}
                  <button type="button" className="button secondary" onClick={() => toggleEnabled(a.id, !a.enabled)}>{a.enabled ? "停用" : "启用"}</button>
                  <button type="button" className="button secondary" onClick={() => deleteAsset(a.id, a.title)} style={{ color: "#f28b82" }}>删除</button>
                </div>
              </div>
            ))}
          </div>
          {pageCount > 1 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", fontSize: 12, color: "#929dab" }}>
              <button type="button" className="button secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
              <span>第 {page + 1} / {pageCount} 页（共 {filtered.length} 个）</span>
              <button type="button" className="button secondary" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>下一页</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {section === "url" ? (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>通过 URL 添加背景</h3>
          <p style={{ margin: 0, fontSize: 12, color: "#929dab" }}>只允许 HTTPS 直链（图片/GIF/MP4/WebM）。服务端会检查可达性与文件类型（拒绝 localhost、私有 IP、元数据地址）。普通网页地址、网盘分享页不是媒体直链，无法导入。</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="粘贴图片/GIF/MP4/WebM 直链，如 https://example.com/bg.webp" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
            <button type="button" className="button primary" disabled={urlChecking} onClick={checkUrl}>{urlChecking ? "检查中…" : "检查 URL"}</button>
          </div>
          {urlInfo ? (
            <div style={{ fontSize: 12, color: urlInfo.ok ? "#7dffce" : "#f28b82", border: "1px solid #29313c", borderRadius: 8, padding: 10 }}>
              {urlInfo.ok
                ? `可访问：${urlInfo.media_kind === "video" ? "视频" : "图片"} · ${urlInfo.mime || ""} · ${formatBytes(urlInfo.size ?? null)}${urlInfo.width ? ` · ${urlInfo.width}×${urlInfo.height}` : ""}`
                : `检查失败：${urlInfo.error || "资源不可访问或类型不支持。"}`}
            </div>
          ) : null}
          {urlInfo?.ok ? (
            <>
              <input style={inputStyle} placeholder="标题（必填）" value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="分类" value={urlCategory} onChange={(e) => setUrlCategory(e.target.value)} />
                <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="作者" value={urlAuthor} onChange={(e) => setUrlAuthor(e.target.value)} />
                <input style={{ ...inputStyle, flex: "1 1 160px" }} placeholder="来源" value={urlSource} onChange={(e) => setUrlSource(e.target.value)} />
                <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="许可证，如 CC0" value={urlLicense} onChange={(e) => setUrlLicense(e.target.value)} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#f2c94c" }}>未填写许可证的资源将进入待审核，管理员确认授权后才能启用。</p>
              <div><button type="button" className="button primary" onClick={saveUrlAsset}>保存到资源库</button></div>
            </>
          ) : null}
          <R2Upload say={say} onUploaded={() => { loadAssets(); loadStats(); }} />
        </div>
      ) : null}

      {section === "github" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <form className="card" style={{ display: "grid", gap: 10 }} onSubmit={(e) => { e.preventDefault(); addSource(); }}>
            <h3 style={{ margin: 0 }}>添加公开仓库资源同步</h3>
            <input style={inputStyle} placeholder="来源名称，如 OUTAI Background Library" value={srcName} onChange={(e) => setSrcName(e.target.value)} />
            <input style={inputStyle} placeholder="manifest.json 地址，如 https://raw.githubusercontent.com/outaidage/outai-background-library/main/manifest.json" value={srcManifest} onChange={(e) => setSrcManifest(e.target.value)} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 12, color: "#aab3c0" }}>同步周期（小时）</label>
              <input style={{ ...inputStyle, width: 90 }} type="number" min={1} max={168} value={srcInterval} onChange={(e) => setSrcInterval(Number(e.target.value))} />
              <button type="submit" className="button primary">添加来源</button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#929dab" }}>同步用 manifest.json 模式：新增资源进入待审核；更新保留资源 ID；失效资源标异常不删除；没有许可证的资源不自动启用。定时同步每 6 小时（默认）由服务端执行，不依赖访客访问。</p>
          </form>
          {sources.length === 0 ? <div className="card"><p style={{ margin: 0 }}>还没有资源来源。</p></div> : null}
          {sources.map((s) => (
            <div key={s.id} className="card" style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <strong style={{ fontSize: 14 }}>{s.name}</strong>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className="button primary" disabled={syncing === s.id} onClick={() => syncSource(s.id, s.name)}>{syncing === s.id ? "同步中…" : "手动同步"}</button>
                  <button type="button" className="button secondary" onClick={() => toggleSource(s.id, !s.enabled)}>{s.enabled ? "暂停" : "恢复"}</button>
                  <button type="button" className="button secondary" onClick={() => deleteSource(s.id, s.name)} style={{ color: "#f28b82" }}>删除来源</button>
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#929dab", wordBreak: "break-all" }}>{s.manifest_url}</div>
              <div style={{ fontSize: 12, color: "#aab3c0" }}>同步周期 {s.sync_interval_hours} 小时 · {s.enabled ? "已启用" : "已暂停"} · 上次同步 {s.last_sync_at ? new Date(s.last_sync_at).toLocaleString("zh-CN") : "从未"} {s.last_sync_status ? `（${s.last_sync_status}）` : ""}</div>
            </div>
          ))}
          <div className="card">
            <h3 style={{ margin: "0 0 10px" }}>同步日志（最近 20 条）</h3>
            {syncLogs.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: "#929dab" }}>还没有同步记录。</p> : null}
            <div style={{ display: "grid", gap: 8 }}>
              {syncLogs.map((l) => (
                <div key={l.id} style={{ fontSize: 12, color: "#aab3c0", borderBottom: "1px solid #29313c", paddingBottom: 8 }}>
                  <div>{new Date(l.started_at).toLocaleString("zh-CN")} · {l.status} · 新增 {l.added} · 更新 {l.updated} · 重复 {l.duplicates} · 异常 {l.broken}</div>
                  {l.error_message ? <div style={{ color: "#f28b82" }}>{l.error_message}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {section === "rotation" ? (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>自动轮换设置</h3>
          <label style={{ fontSize: 12, color: "#aab3c0", display: "grid", gap: 6 }}>
            轮换模式
            <select value={rotation.mode} onChange={(e) => setRotation({ ...rotation, mode: e.target.value })} style={inputStyle}>
              <option value="manual">手动固定背景</option>
              <option value="random_each_visit">每次访问随机</option>
              <option value="timed">定时随机轮播</option>
              <option value="daily">每日更换</option>
              <option value="favorites">收藏背景随机</option>
              <option value="category">指定分类轮换</option>
              <option value="source">指定资源来源轮换</option>
              <option value="collection">指定背景集合轮换</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#aab3c0", display: "grid", gap: 6 }}>
            轮换间隔（分钟，仅定时轮播模式）
            <input style={inputStyle} type="number" min={1} max={1440} value={rotation.interval_minutes} onChange={(e) => setRotation({ ...rotation, interval_minutes: Number(e.target.value) })} />
          </label>
          {rotation.mode === "category" ? (
            <label style={{ fontSize: 12, color: "#aab3c0", display: "grid", gap: 6 }}>
              指定分类
              <input style={inputStyle} placeholder="如 space" value={rotation.category || ""} onChange={(e) => setRotation({ ...rotation, category: e.target.value })} />
            </label>
          ) : null}
          {rotation.mode === "collection" ? (
            <label style={{ fontSize: 12, color: "#aab3c0", display: "grid", gap: 6 }}>
              指定收藏夹
              <input style={inputStyle} placeholder="如 默认收藏" value={rotation.collection || ""} onChange={(e) => setRotation({ ...rotation, collection: e.target.value })} />
            </label>
          ) : null}
          <p style={{ margin: 0, fontSize: 12, color: "#929dab" }}>轮换由前端播放时钟执行（访客打开页面时按模式选背景）；GitHub 同步的定时任务是另一回事（服务端每 6 小时同步资源清单），两者不要混淆。手动切换背景后锁定 1 小时，锁定期内不自动轮换。</p>
          <div><button type="button" className="button primary" disabled={rotationSaving} onClick={saveRotation}>{rotationSaving ? "保存中…" : "保存轮换设置"}</button></div>
        </div>
      ) : null}

      {section === "stats" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
          {[
            ["资源总数", stats.total],
            ["已启用", stats.active],
            ["待审核", stats.pending],
            ["异常", stats.broken],
            ["喜欢总数", stats.likes],
            ["收藏总数", stats.favorites],
          ].map(([label, value]) => (
            <div key={label as string} className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, color: "#61edff" }}>{value}</div>
              <div style={{ fontSize: 12, color: "#929dab" }}>{label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {preview ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(3,4,11,0.9)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }} onClick={() => setPreview(null)}>
          <div className="card" style={{ width: "min(720px, 94vw)", maxHeight: "90vh", overflow: "auto", display: "grid", gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 15 }}>{preview.title}</strong>
              <button type="button" className="button secondary" onClick={() => setPreview(null)}>关闭</button>
            </div>
            {preview.media_kind === "video" ? (
              <video src={preview.url} poster={preview.thumbnail_url || undefined} controls muted loop playsInline style={{ width: "100%", borderRadius: 8, background: "#0a0d20" }} />
            ) : (
              <img src={preview.url} alt={preview.title} style={{ width: "100%", borderRadius: 8, background: "#0a0d20" }} />
            )}
            <div style={{ fontSize: 12, color: "#aab3c0", display: "grid", gap: 4 }}>
              <span>{preview.description || "（无描述）"}</span>
              <span>分类 {preview.category} · {preview.media_kind === "video" ? "视频" : "图片"} · {formatBytes(preview.file_size_bytes)}{preview.width ? ` · ${preview.width}×${preview.height}` : ""}{preview.duration_seconds ? ` · ${Math.round(preview.duration_seconds)} 秒` : ""}</span>
              <span>来源 {preview.source || "—"} · 作者 {preview.author || "—"} · 许可证 {preview.license || "未注明（待审核）"}</span>
              <span style={{ wordBreak: "break-all" }}>地址 {preview.url}</span>
              <span>状态 {STATUS_LABEL[preview.status] || preview.status} · {preview.enabled ? "已启用" : "已停用"}{preview.is_featured ? " · ★ 首页背景" : ""}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="button primary" onClick={() => { applyAsHome(preview.id, preview.title); setPreview(null); }}>设为首页背景</button>
              {preview.status === "pending_review" ? <button type="button" className="button secondary" onClick={() => { setAssetStatus(preview.id, "active"); setPreview(null); }}>通过审核</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(3,4,11,0.9)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }} onClick={() => setConfirm(null)}>
          <div className="card" style={{ width: "min(440px, 94vw)", display: "grid", gap: 12, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <strong style={{ fontSize: 15 }}>{confirm.title}</strong>
            <p style={{ margin: 0, fontSize: 13, color: "#aab3c0" }}>{confirm.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="button secondary" onClick={() => setConfirm(null)}>取消</button>
              <button type="button" className="button primary" style={{ background: "#e5484d", borderColor: "#e5484d" }} onClick={() => { const fn = confirm.onConfirm; setConfirm(null); fn(); }}>确定删除</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
