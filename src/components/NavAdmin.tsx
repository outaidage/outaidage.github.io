// NavAdmin.tsx — 顶部导航管理。
// 网站最顶部的导航栏由 home_modules 驱动（show_in_nav 的已发布模块），
// 以前只能在「首页模块」里顺带勾选，且保存后不触发重新部署，改了像没改。
// 这里给导航一个专门的编辑面：显示哪些模块、顺序、点开去哪，一页搞定；
// 保存后自动触发重新部署（导航是构建时渲染的），约 2 分钟生效。
// 与「首页模块」共用同一份数据：在这里改名 / 改路径，首页卡片同步变化；
// 模块的增删、图标、说明仍在「首页模块」里管理。
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { triggerDeploy } from "@/lib/trigger-deploy";

type NavRow = {
  id: string;
  name: string;
  path: string;
  sort_order: number;
  show_in_nav: boolean;
  enabled: boolean;
  status: string;
};

const ROUTES = [
  "/", "/blog/", "/guestbook/", "/collection/", "/projects/", "/ai-lab/",
  "/links/", "/changelog/", "/about/", "/now/", "/toolbox/", "/contact/",
  "/search/", "/#universe",
];

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

export default function NavAdmin({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [rows, setRows] = useState<NavRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("home_modules")
      .select("id,name,path,sort_order,show_in_nav,enabled,status")
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) {
      say("err", `加载导航失败：${error.message}`);
      return;
    }
    setRows((data || []) as NavRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(id: string, p: Partial<NavRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function move(idx: number, dir: -1 | 1) {
    setRows((rs) => {
      const j = idx + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      const a = next[idx], b = next[j];
      next[idx] = { ...b, sort_order: a.sort_order };
      next[j] = { ...a, sort_order: b.sort_order };
      return next;
    });
  }

  const navPreview = rows.filter((r) => r.show_in_nav && r.enabled && r.status === "published");

  async function save() {
    if (!supabase) return;
    for (const r of rows) {
      if (!r.name.trim()) { say("err", "模块名称不能为空。"); return; }
      if (!/^\//.test(r.path.trim()) && !/^https?:\/\//.test(r.path.trim())) {
        say("err", `“${r.name}”的路径要以 / 开头（站内）或 http 开头（外链）。`);
        return;
      }
    }
    setSaving(true);
    for (const r of rows) {
      const { error } = await supabase
        .from("home_modules")
        .update({
          name: r.name.trim(),
          path: r.path.trim(),
          show_in_nav: r.show_in_nav,
          sort_order: r.sort_order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (error) {
        setSaving(false);
        say("err", `保存失败：${error.message}`);
        return;
      }
    }
    setSaving(false);
    // 导航是构建时渲染的：保存后必须重新部署才生效（这正是以前
    // “改了没反应”的原因——只存了数据库，没触发部署）。
    const dep = await triggerDeploy();
    if (dep.ok) {
      say("ok", "导航已保存，正在重新部署，约 2 分钟后生效。");
    } else {
      say("err", `导航已保存，但自动部署触发失败：${dep.error}。改动会随下次定时重建（10:00 / 15:00 / 22:00）生效。`);
    }
    load();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>顶部导航管理</h3>
        <p style={{ margin: 0, color: "var(--text-dim)", fontSize: 13, lineHeight: 1.8 }}>
          这里管网站最顶部的导航栏：显示哪些模块、排列顺序、点开后去哪个页面。
          勾选「导航显示」的已发布模块会出现在顶栏；用 ↑ ↓ 调顺序；路径可从下拉里选，也可以填外链。
          保存后自动重新部署，约 2 分钟生效。与「首页模块」共用同一份数据——在这里改名 / 改路径，
          首页的模块卡片会同步；模块的增删、图标、说明在「首页模块」里改。
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 13 }}>
          当前导航预览：{navPreview.length ? navPreview.map((r) => r.name).join(" · ") : "（空）"}
        </p>
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
        {loading ? <p style={{ margin: 0 }}>正在加载…</p> : null}
        {rows.map((r, i) => {
          const blocked = !r.enabled || r.status !== "published";
          return (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr 1.2fr auto", gap: 10, alignItems: "center" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, whiteSpace: "nowrap" }}>
                <input
                  type="checkbox"
                  checked={r.show_in_nav}
                  onChange={(e) => patch(r.id, { show_in_nav: e.target.checked })}
                />
                导航显示
              </label>
              <input
                style={inputStyle}
                value={r.name}
                onChange={(e) => patch(r.id, { name: e.target.value })}
                aria-label="模块名称"
              />
              <input
                style={inputStyle}
                value={r.path}
                onChange={(e) => patch(r.id, { path: e.target.value })}
                list="nav-route-list"
                aria-label="点击打开的页面路径"
              />
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button className="button secondary" type="button" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button className="button secondary" type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</button>
                {blocked ? (
                  <span style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
                    {r.status !== "published" ? "未发布" : "未启用"}，不会显示
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
        <datalist id="nav-route-list">
          {ROUTES.map((p) => <option key={p} value={p} />)}
        </datalist>
        <div>
          <button className="button primary" type="button" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存导航"}
          </button>
        </div>
      </div>
    </div>
  );
}
