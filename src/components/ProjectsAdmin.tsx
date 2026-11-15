// ProjectsAdmin.tsx — 项目空间管理（后台「项目管理」标签页）。
// projects 表的增删改：名称、描述、链接、状态、排序。列表按 sort_order 排序。
// 删除用应用内确认框（不用 window.confirm，测试浏览器会自动关掉原生框）。
// 项目在首页「02 / RECENT PROJECTS」与 /projects/ 展示；改完即对已发布
// 内容生效（项目列表由 Supabase 驱动，首页下次打开即更新，无需重新部署）。
import { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  url: string;
  status: "in_progress" | "planned" | "completed";
  sort_order: number;
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

const labelStyle: React.CSSProperties = { fontSize: 12, color: "#929dab", display: "block", marginBottom: 4 };

const STATUS_LABELS: Record<ProjectRow["status"], string> = {
  in_progress: "进行中",
  planned: "计划中",
  completed: "已完成",
};

const emptyForm = (): Omit<ProjectRow, "id"> => ({
  name: "",
  description: "",
  url: "",
  status: "in_progress",
  sort_order: 0,
});

export default function ProjectsAdmin({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ProjectRow, "id">>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; onYes: () => void } | null>(null);

  const configured = hasSupabaseConfig;

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,description,url,status,sort_order")
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) {
      say("err", `加载项目失败：${error.message}`);
      return;
    }
    setRows((data as ProjectRow[]) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setEditingId("new");
    setForm(emptyForm());
  }

  function startEdit(row: ProjectRow) {
    setEditingId(row.id);
    setForm({ name: row.name, description: row.description, url: row.url, status: row.status, sort_order: row.sort_order });
  }

  async function save() {
    if (!supabase || !configured) return;
    if (!form.name.trim()) {
      say("err", "项目名称不能为空。");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description,
      url: form.url.trim(),
      status: form.status,
      sort_order: Number.isFinite(form.sort_order) ? form.sort_order : 0,
    };
    const { error } =
      editingId === "new"
        ? await supabase.from("projects").insert(payload)
        : await supabase.from("projects").update(payload).eq("id", editingId);
    setSaving(false);
    if (error) {
      say("err", `保存项目失败：${error.message}`);
      return;
    }
    say("ok", editingId === "new" ? "项目已添加。" : "项目已保存。");
    setEditingId(null);
    setForm(emptyForm());
    load();
  }

  function askDelete(row: ProjectRow) {
    setConfirm({
      message: `确定删除项目「${row.name}」吗？删除后首页与项目页不再显示它。`,
      onYes: async () => {
        setConfirm(null);
        if (!supabase) return;
        const { error } = await supabase.from("projects").delete().eq("id", row.id);
        if (error) {
          say("err", `删除项目失败：${error.message}`);
          return;
        }
        say("ok", "项目已删除。");
        load();
      },
    });
  }

  if (!configured) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>项目管理</h3>
        <p style={{ color: "#929dab", fontSize: 13, margin: 0 }}>Supabase 未配置，无法管理项目。</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>项目管理</h3>
          <button className="button primary" onClick={startNew}>
            新建项目
          </button>
        </div>
        <p style={{ color: "#929dab", fontSize: 12, margin: "8px 0 0", lineHeight: 1.7 }}>
          项目在首页「02 / RECENT PROJECTS」与 /projects/ 展示。保存后下次打开页面即更新，无需重新部署。
          {loading ? " 加载中…" : ""}
        </p>
      </div>

      {editingId ? (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 12 }}>
          <h4 style={{ margin: 0 }}>{editingId === "new" ? "新建项目" : "编辑项目"}</h4>
          <div>
            <label style={labelStyle}>名称</label>
            <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>描述</label>
            <textarea
              style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label style={labelStyle}>链接（可空）</label>
            <input style={inputStyle} value={form.url} placeholder="https://…" onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>状态</label>
              <select
                style={inputStyle}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectRow["status"] }))}
              >
                <option value="in_progress">进行中</option>
                <option value="planned">计划中</option>
                <option value="completed">已完成</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>排序（数字越小越靠前）</label>
              <input
                style={inputStyle}
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button primary" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm());
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.length === 0 && !loading ? (
          <div className="card" style={{ padding: 16, color: "#929dab", fontSize: 13 }}>
            还没有项目，点「新建项目」添加。
          </div>
        ) : null}
        {rows.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {r.name}{" "}
                <span style={{ fontSize: 11, color: "#929dab", fontWeight: 400 }}>
                  {STATUS_LABELS[r.status]} · 排序 {r.sort_order}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#aab3c0", marginTop: 4, lineHeight: 1.6 }}>{r.description || "（无描述）"}</div>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#61edff" }}>
                  {r.url}
                </a>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button className="button secondary" onClick={() => startEdit(r)}>
                编辑
              </button>
              <button className="button secondary" onClick={() => askDelete(r)}>
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirm ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(3,4,11,.7)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16,
          }}
        >
          <div className="card" style={{ padding: 20, maxWidth: 420 }}>
            <p style={{ margin: "0 0 16px", lineHeight: 1.7 }}>{confirm.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="button secondary" onClick={() => setConfirm(null)}>
                取消
              </button>
              <button className="button primary" onClick={confirm.onYes}>
                确定删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
