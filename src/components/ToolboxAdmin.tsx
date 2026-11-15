// ToolboxAdmin.tsx — 工具箱管理（后台「工具箱」标签页）。
// 编辑在线工具箱 3 个内置工具的元数据：名称、说明、排序、启用。
// 工具逻辑仍在代码里按 id（json / base64 / chars）实现，后台只改元数据，
// 不新增工具类型。保存后自动触发一次部署，约 2 分钟上线；若触发失败，
// 改动会随下次定时重建（10:00 / 15:00 / 22:00）上线。
import { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import { DEFAULT_TOOLS, type ToolboxToolMeta } from "@/lib/toolbox-tools";
import { triggerDeploy } from "@/lib/trigger-deploy";

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

const labelStyle: React.CSSProperties = { fontSize: 12, color: "#929dab", display: "block", marginBottom: 4 };

export default function ToolboxAdmin({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [tools, setTools] = useState<ToolboxToolMeta[]>(DEFAULT_TOOLS.map((t) => ({ ...t })));
  const [saved, setSaved] = useState<ToolboxToolMeta[]>(DEFAULT_TOOLS.map((t) => ({ ...t })));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const configured = hasSupabaseConfig;
  const dirty = JSON.stringify(tools) !== JSON.stringify(saved);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("toolbox_tools")
      .select("id,name,description,sort_order,enabled")
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) {
      say("err", `加载工具箱失败：${error.message}（若表不存在，请先执行 migration 019）`);
      return;
    }
    if (data && data.length) {
      const rows = (data as ToolboxToolMeta[]).map((t) => ({ ...t }));
      setSaved(rows);
      setTools(rows.map((t) => ({ ...t })));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTool(i: number, patch: Partial<ToolboxToolMeta>) {
    setTools((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  async function save() {
    if (!supabase || !configured) return;
    const bad = tools.find((t) => !t.name.trim());
    if (bad) {
      say("err", "工具名称不能为空。");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("toolbox_tools").upsert(
      tools.map((t) => ({
        id: t.id,
        name: t.name.trim(),
        description: t.description,
        sort_order: Number.isFinite(t.sort_order) ? t.sort_order : 0,
        enabled: t.enabled,
      })),
    );
    setSaving(false);
    if (error) {
      say("err", `保存工具箱失败：${error.message}`);
      return;
    }
    setSaved(tools.map((t) => ({ ...t })));
    // 保存后自动触发一次部署（与文章保存后自动部署一致），约 2 分钟上线。
    const dep = await triggerDeploy();
    if (dep.ok) {
      say("ok", "工具箱已保存，正在重新部署，约 2 分钟后上线。");
    } else {
      say("err", `工具箱已保存，但自动部署触发失败：${dep.error}。改动会随下次定时重建（10:00 / 15:00 / 22:00）上线。`);
    }
  }

  if (!configured) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>工具箱</h3>
        <p style={{ color: "#929dab", fontSize: 13, margin: 0 }}>Supabase 未配置，无法管理工具箱。</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>工具箱</h3>
          <a className="button secondary" href="/toolbox/" target="_blank" rel="noopener noreferrer">
            查看工具箱 ↗
          </a>
        </div>
        <p style={{ color: "#929dab", fontSize: 12, margin: "8px 0 0", lineHeight: 1.7 }}>
          编辑 3 个内置工具的名称、说明、排序与启用状态。工具本身的功能由代码实现，这里不新增工具类型。
          保存后自动触发一次部署，约 2 分钟后上线。
          {dirty ? " 当前有未保存的改动。" : ""}
          {loading ? " 加载中…" : ""}
        </p>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {tools.map((t, i) => (
          <div key={t.id} className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>工具：{t.id}</strong>
              <label style={{ fontSize: 12, color: "#929dab", display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={t.enabled} onChange={(e) => setTool(i, { enabled: e.target.checked })} />
                启用
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 110px", gap: 8 }}>
              <div>
                <label style={labelStyle}>名称</label>
                <input style={inputStyle} value={t.name} onChange={(e) => setTool(i, { name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>说明</label>
                <input style={inputStyle} value={t.description} onChange={(e) => setTool(i, { description: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>排序</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={t.sort_order}
                  onChange={(e) => setTool(i, { sort_order: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="button primary" onClick={save} disabled={saving || !dirty}>
          {saving ? "保存中…" : "保存工具箱"}
        </button>
        <button className="button secondary" onClick={() => setTools(saved.map((t) => ({ ...t })))} disabled={!dirty}>
          取消
        </button>
      </div>
    </div>
  );
}
