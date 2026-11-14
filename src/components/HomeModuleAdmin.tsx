// HomeModuleAdmin.tsx — 首页模块管理（数字宇宙门户）。
// 后台管理 home_modules 表：新增 / 编辑 / 删除 / 复制 / 上移 / 下移 /
// 首页显示 / 导航显示 / 启用 / 状态（草稿/发布/下线）/ 预览 / 恢复默认。
// 模块只定义首页入口与跳转，不管理模块里的内容（文章、书签等各有自己的管理）。
// 删除模块不会删除模块指向页面的内容。
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_MODULES, type HomeModule } from "@/lib/home-modules";

type ModuleForm = {
  id: string;
  name: string;
  name_en: string;
  description: string;
  icon: string;
  cover_image: string;
  theme_color: string;
  path: string;
  category: string;
  sort_order: number;
  show_on_home: boolean;
  enabled: boolean;
  show_in_nav: boolean;
  featured: boolean;
  status: "draft" | "published" | "offline";
};

const emptyForm = (): ModuleForm => ({
  id: "",
  name: "",
  name_en: "",
  description: "",
  icon: "✦",
  cover_image: "",
  theme_color: "#61EDFF",
  path: "/",
  category: "内容",
  sort_order: 100,
  show_on_home: true,
  enabled: true,
  show_in_nav: false,
  featured: false,
  status: "published",
});

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

const STATUS_LABEL: Record<string, string> = { draft: "草稿", published: "已发布", offline: "已下线" };

export default function HomeModuleAdmin({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [modules, setModules] = useState<HomeModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ModuleForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // 应用内确认弹窗（不用 window.confirm：自动化浏览器会直接 dismiss 原生确认框，
  // 且与文章/书签删除的弹窗体验一致）。
  const [confirm, setConfirm] = useState<{ kind: "delete" | "restore"; id?: string; name?: string; message: string } | null>(null);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("home_modules")
      .select("id,name,name_en,description,icon,cover_image,theme_color,path,category,sort_order,show_on_home,enabled,show_in_nav,featured,status,created_at,updated_at")
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) {
      say("err", `加载模块失败：${error.message}（若表不存在，请先执行 migration 009）`);
      return;
    }
    setModules((data || []) as HomeModule[]);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(m: HomeModule) {
    setEditingId(m.id);
    setForm({
      id: m.id,
      name: m.name,
      name_en: m.name_en,
      description: m.description,
      icon: m.icon,
      cover_image: m.cover_image,
      theme_color: m.theme_color,
      path: m.path,
      category: m.category,
      sort_order: m.sort_order,
      show_on_home: m.show_on_home,
      enabled: m.enabled,
      show_in_nav: m.show_in_nav,
      featured: m.featured,
      status: m.status as ModuleForm["status"],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!form.id.trim() || !/^[a-z0-9-]+$/.test(form.id.trim())) {
      say("err", "模块 ID 只能用小写字母、数字和 -，例如 my-module。");
      return;
    }
    if (!form.name.trim() || !form.path.trim()) {
      say("err", "请填写模块名称和页面路径。");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      path: form.path.trim(),
      updated_at: new Date().toISOString(),
    };
    let error;
    if (editingId) {
      ({ error } = await supabase.from("home_modules").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("home_modules").insert(payload));
    }
    setSaving(false);
    if (error) {
      say("err", `保存失败：${error.message}`);
      return;
    }
    say("ok", editingId ? `模块“${form.name}”已更新。` : `模块“${form.name}”已添加。`);
    startNew();
    load();
  }

  async function remove(id: string, name: string) {
    if (!supabase) return;
    const { error } = await supabase.from("home_modules").delete().eq("id", id);
    if (error) {
      say("err", `删除失败：${error.message}`);
      return;
    }
    say("ok", `模块“${name}”已删除。`);
    load();
  }

  async function duplicate(m: HomeModule) {
    if (!supabase) return;
    const copyId = `${m.id}-copy`;
    const { error } = await supabase.from("home_modules").insert({
      ...m,
      id: copyId,
      name: `${m.name}（副本）`,
      sort_order: m.sort_order + 5,
      status: "draft",
      created_at: undefined,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      say("err", `复制失败：${error.message}`);
      return;
    }
    say("ok", `已复制为“${m.name}（副本）”（草稿状态）。`);
    load();
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = modules.findIndex((m) => m.id === id);
    const swap = modules[idx + dir];
    if (!supabase || idx < 0 || !swap) return;
    const a = modules[idx];
    const { error: e1 } = await supabase.from("home_modules").update({ sort_order: swap.sort_order }).eq("id", a.id);
    const { error: e2 } = await supabase.from("home_modules").update({ sort_order: a.sort_order }).eq("id", swap.id);
    if (e1 || e2) {
      say("err", `排序失败：${(e1 || e2)?.message}`);
      return;
    }
    load();
  }

  async function toggle(id: string, field: "show_on_home" | "show_in_nav" | "enabled", value: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from("home_modules").update({ [field]: value }).eq("id", id);
    if (error) {
      say("err", `更新失败：${error.message}`);
      return;
    }
    load();
  }

  async function setStatus(id: string, status: ModuleForm["status"]) {
    if (!supabase) return;
    const { error } = await supabase.from("home_modules").update({ status }).eq("id", id);
    if (error) {
      say("err", `更新失败：${error.message}`);
      return;
    }
    say("ok", `模块状态已改为「${STATUS_LABEL[status]}」。`);
    load();
  }

  async function restoreDefaults() {
    if (!supabase) return;
    const { error: delErr } = await supabase.from("home_modules").delete().neq("id", "__none__");
    if (delErr) {
      say("err", `恢复失败：${delErr.message}`);
      return;
    }
    const seeds = DEFAULT_MODULES.map((m) => ({
      id: m.id,
      name: m.name,
      name_en: m.name_en,
      description: m.description,
      icon: m.icon,
      cover_image: m.cover_image,
      theme_color: m.theme_color,
      path: m.path,
      category: m.category,
      sort_order: m.sort_order,
      show_on_home: m.show_on_home,
      enabled: m.enabled,
      show_in_nav: m.show_in_nav,
      featured: m.featured,
      status: m.status,
    }));
    const { error } = await supabase.from("home_modules").insert(seeds);
    if (error) {
      say("err", `恢复失败：${error.message}`);
      return;
    }
    say("ok", "已恢复 10 个默认模块。");
    load();
  }

  const preview = previewId ? modules.find((m) => m.id === previewId) : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="button primary" onClick={startNew}>新增模块</button>
        <button type="button" className="button secondary" onClick={load}>刷新列表</button>
        <button type="button" className="button secondary" onClick={() => setConfirm({ kind: "restore", message: "确定恢复默认模块配置吗？这会删除现有模块并重建 10 个默认模块（不会删除任何文章、书签或页面内容）。" })}>恢复默认模块配置</button>
        <span style={{ fontSize: 12, color: "#929dab" }}>模块只定义首页入口与跳转；删除模块不会删除文章、书签等内容。</span>
      </div>

      <form className="card" onSubmit={save} style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{editingId ? `编辑模块：${editingId}` : "新增模块"}</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, flex: "1 1 160px" }} required placeholder="模块 ID（小写字母/数字/-，如 my-module）" value={form.id} disabled={!!editingId} onChange={(e) => setForm({ ...form, id: e.target.value })} />
          <input style={{ ...inputStyle, flex: "1 1 160px" }} required placeholder="模块名称，如 文章中心" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input style={{ ...inputStyle, flex: "1 1 160px" }} placeholder="英文名称，如 Knowledge Galaxy" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
        </div>
        <input style={inputStyle} placeholder="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="图标（字符，如 ✦）" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="主题色，如 #61EDFF" value={form.theme_color} onChange={(e) => setForm({ ...form, theme_color: e.target.value })} />
          <input style={{ ...inputStyle, flex: "1 1 160px" }} required placeholder="页面路径，如 /blog/" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} />
          <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="分类，如 内容" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input style={{ ...inputStyle, flex: "1 1 100px" }} type="number" placeholder="排序权重" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </div>
        <input style={inputStyle} placeholder="封面图片 URL（可选）" value={form.cover_image} onChange={(e) => setForm({ ...form, cover_image: e.target.value })} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#aab3c0" }}>
          <label><input type="checkbox" checked={form.show_on_home} onChange={(e) => setForm({ ...form, show_on_home: e.target.checked })} /> 首页显示</label>
          <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> 启用</label>
          <label><input type="checkbox" checked={form.show_in_nav} onChange={(e) => setForm({ ...form, show_in_nav: e.target.checked })} /> 导航栏显示</label>
          <label><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> 推荐</label>
          <label>状态：
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ModuleForm["status"] })} style={{ ...inputStyle, width: "auto", display: "inline-block", marginLeft: 6 }}>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="offline">已下线</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="button primary" disabled={saving}>{saving ? "保存中…" : editingId ? "保存修改" : "添加模块"}</button>
          {editingId ? <button type="button" className="button secondary" onClick={startNew}>取消编辑</button> : null}
        </div>
      </form>

      {preview ? (
        <div className="card" style={{ borderTop: `2px solid ${preview.theme_color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>模块预览</strong>
            <button type="button" className="button secondary" onClick={() => setPreviewId(null)}>关闭预览</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 22, color: preview.theme_color, width: 40, height: 40, display: "grid", placeItems: "center", border: `1px solid ${preview.theme_color}55`, borderRadius: 10, background: `${preview.theme_color}14` }}>{preview.icon}</span>
            <span>
              <strong style={{ fontSize: 15, display: "block" }}>{preview.name}</strong>
              <span style={{ fontSize: 11, color: "#929dab" }}>{preview.name_en}</span>
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#aab3c0", lineHeight: 1.6 }}>{preview.description}</p>
          <span style={{ fontSize: 12, color: preview.theme_color }}>进入 → {preview.path}</span>
        </div>
      ) : null}

      {loading ? <p style={{ fontSize: 12, color: "#929dab" }}>正在加载模块…</p> : null}
      {!loading && modules.length === 0 ? (
        <div className="card"><p style={{ margin: 0 }}>还没有模块。点击「恢复默认模块配置」重建 10 个默认模块，或新增一个。</p></div>
      ) : null}
      <div style={{ display: "grid", gap: 10 }}>
        {modules.map((m, i) => (
          <div key={m.id} className="card" style={{ display: "grid", gap: 8, borderTop: `2px solid ${m.theme_color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: m.theme_color, fontSize: 18 }}>{m.icon}</span>
                <strong style={{ fontSize: 14 }}>{m.name}</strong>
                <span style={{ fontSize: 11, color: "#929dab" }}>{m.id} · {m.path} · 排序 {m.sort_order}</span>
                <span style={{ fontSize: 11, color: m.status === "published" ? "#7dffce" : m.status === "draft" ? "#fbbf24" : "#929dab" }}>{STATUS_LABEL[m.status]}</span>
                {!m.enabled ? <span style={{ fontSize: 11, color: "#f28b82" }}>已停用</span> : null}
                {m.featured ? <span style={{ fontSize: 11, color: "#f2c94c" }}>推荐</span> : null}
              </span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="button secondary" onClick={() => move(m.id, -1)} disabled={i === 0}>上移</button>
                <button type="button" className="button secondary" onClick={() => move(m.id, 1)} disabled={i === modules.length - 1}>下移</button>
                <button type="button" className="button secondary" onClick={() => setPreviewId(m.id)}>预览</button>
                <button type="button" className="button secondary" onClick={() => startEdit(m)}>编辑</button>
                <button type="button" className="button secondary" onClick={() => duplicate(m)}>复制</button>
                <button type="button" className="button secondary" onClick={() => setConfirm({ kind: "delete", id: m.id, name: m.name, message: `确定删除模块「${m.name}」吗？这只删除首页入口，不会删除该模块指向页面的内容。` })} style={{ color: "#f28b82" }}>删除</button>
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#aab3c0" }}>{m.description || "（无描述）"}</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#aab3c0" }}>
              <label><input type="checkbox" checked={m.show_on_home} onChange={(e) => toggle(m.id, "show_on_home", e.target.checked)} /> 首页显示</label>
              <label><input type="checkbox" checked={m.show_in_nav} onChange={(e) => toggle(m.id, "show_in_nav", e.target.checked)} /> 导航栏显示</label>
              <label><input type="checkbox" checked={m.enabled} onChange={(e) => toggle(m.id, "enabled", e.target.checked)} /> 启用</label>
              <label>状态：
                <select value={m.status} onChange={(e) => setStatus(m.id, e.target.value as ModuleForm["status"])} style={{ ...inputStyle, width: "auto", display: "inline-block", marginLeft: 6 }}>
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="offline">已下线</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
      {confirm ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(3,4,11,0.8)", display: "grid", placeItems: "center", zIndex: 100 }} onClick={() => setConfirm(null)}>
          <div className="card" style={{ width: "min(420px, 90vw)", display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>确定删除？</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#aab3c0", lineHeight: 1.6 }}>{confirm.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="button secondary" onClick={() => setConfirm(null)}>取消</button>
              <button
                type="button"
                className="button primary"
                onClick={async () => {
                  const c = confirm;
                  setConfirm(null);
                  if (c.kind === "delete" && c.id && c.name) await remove(c.id, c.name);
                  if (c.kind === "restore") await restoreDefaults();
                }}
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
