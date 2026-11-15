// ChangelogAdmin.tsx — 更新日志管理（后台「更新日志」标签页）。
// changelog_entries 表的增删改：版本号、标题、正文、发布日期。列表按发布日期倒序。
// 删除用应用内确认框（不用 window.confirm，测试浏览器会自动关掉原生框）。
// 更新日志在 /changelog/ 展示；改完即对已发布内容生效（由 Supabase 驱动，
// 首页下次打开即更新，无需重新部署）。
import { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type ChangelogRow = {
  id: string;
  version: string;
  title: string;
  body: string;
  published_at: string;
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

function toInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = (): Omit<ChangelogRow, "id"> => ({
  version: "",
  title: "",
  body: "",
  published_at: new Date().toISOString(),
});

export default function ChangelogAdmin({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [rows, setRows] = useState<ChangelogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ChangelogRow, "id">>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; onYes: () => void } | null>(null);

  const configured = hasSupabaseConfig;

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("changelog_entries")
      .select("id,version,title,body,published_at")
      .order("published_at", { ascending: false });
    setLoading(false);
    if (error) {
      say("err", `加载更新日志失败：${error.message}`);
      return;
    }
    setRows((data as ChangelogRow[]) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setEditingId("new");
    setForm(emptyForm());
  }

  function startEdit(row: ChangelogRow) {
    setEditingId(row.id);
    setForm({ version: row.version, title: row.title, body: row.body, published_at: row.published_at });
  }

  async function save() {
    if (!supabase || !configured) return;
    if (!form.version.trim() || !form.title.trim()) {
      say("err", "版本号和标题不能为空。");
      return;
    }
    setSaving(true);
    const published = form.published_at ? new Date(form.published_at).toISOString() : new Date().toISOString();
    const payload = {
      version: form.version.trim(),
      title: form.title.trim(),
      body: form.body,
      published_at: Number.isNaN(new Date(published).valueOf()) ? new Date().toISOString() : published,
    };
    const { error } =
      editingId === "new"
        ? await supabase.from("changelog_entries").insert(payload)
        : await supabase.from("changelog_entries").update(payload).eq("id", editingId);
    setSaving(false);
    if (error) {
      say("err", `保存更新日志失败：${error.message}`);
      return;
    }
    say("ok", editingId === "new" ? "更新日志已添加。" : "更新日志已保存。");
    setEditingId(null);
    setForm(emptyForm());
    load();
  }

  function askDelete(row: ChangelogRow) {
    setConfirm({
      message: `确定删除「${row.version} ${row.title}」吗？删除后更新日志页不再显示它。`,
      onYes: async () => {
        setConfirm(null);
        if (!supabase) return;
        const { error } = await supabase.from("changelog_entries").delete().eq("id", row.id);
        if (error) {
          say("err", `删除更新日志失败：${error.message}`);
          return;
        }
        say("ok", "更新日志已删除。");
        load();
      },
    });
  }

  if (!configured) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>更新日志</h3>
        <p style={{ color: "#929dab", fontSize: 13, margin: 0 }}>Supabase 未配置，无法管理更新日志。</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>更新日志</h3>
          <button className="button primary" onClick={startNew}>
            新建版本
          </button>
        </div>
        <p style={{ color: "#929dab", fontSize: 12, margin: "8px 0 0", lineHeight: 1.7 }}>
          更新日志在 /changelog/ 展示。保存后下次打开页面即更新，无需重新部署。
          {loading ? " 加载中…" : ""}
        </p>
      </div>

      {editingId ? (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 12 }}>
          <h4 style={{ margin: 0 }}>{editingId === "new" ? "新建版本" : "编辑版本"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>版本号（如 v2.1.0）</label>
              <input style={inputStyle} value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>发布日期</label>
              <input
                style={inputStyle}
                type="datetime-local"
                value={toInputValue(form.published_at)}
                onChange={(e) => setForm((f) => ({ ...f, published_at: e.target.value ? new Date(e.target.value).toISOString() : f.published_at }))}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>标题</label>
            <input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>正文</label>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
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
            还没有更新日志，点「新建版本」添加。
          </div>
        ) : null}
        {rows.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {r.version} · {r.title}
              </div>
              <div style={{ fontSize: 11, color: "#929dab", marginTop: 2 }}>
                {new Date(r.published_at).toLocaleDateString("zh-CN")}
              </div>
              <div style={{ fontSize: 12, color: "#aab3c0", marginTop: 4, lineHeight: 1.6 }}>
                {r.body.length > 120 ? `${r.body.slice(0, 120)}…` : r.body || "（无正文）"}
              </div>
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
