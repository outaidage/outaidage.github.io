// HeroAdmin.tsx — 首页 Hero 内容管理（后台「首页 Hero」标签页）。
// 编辑 hero_content 单行（id='default'）：眉题、标题（普通 + 渐变两段）、
// 副标题、3 个按钮（文案/链接/样式）、标签（每行一个）、终端命令与输出。
// 编辑全部在本地草稿里，点「保存」才写库，点「取消」丢弃草稿；
// 未保存的改动绝不假装已生效。Supabase 未配置时只读本地默认值并明确
// 提示不可保存（不伪造保存成功）。
// 注意：首页是构建时静态生成，保存后自动触发一次部署，约 2 分钟上线；
// 若自动部署触发失败，改动会随下次定时重建（10:00 / 15:00 / 22:00）上线。
import { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import { DEFAULT_HERO, type HeroButton, type HeroContent } from "@/lib/hero-content";
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

const DEFAULT_BUTTONS: HeroButton[] = DEFAULT_HERO.buttons.map((b) => ({ ...b }));

function toDraft(h: HeroContent): HeroContent & { tagsText: string } {
  return { ...h, buttons: h.buttons.map((b) => ({ ...b })), tags: [...h.tags], tagsText: h.tags.join("\n") };
}

export default function HeroAdmin({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [draft, setDraft] = useState<HeroContent & { tagsText: string }>(toDraft(DEFAULT_HERO));
  const [saved, setSaved] = useState<HeroContent>(DEFAULT_HERO);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; onYes: () => void } | null>(null);

  const configured = hasSupabaseConfig;
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("hero_content")
      .select("eyebrow,title_plain,title_grad,subtitle,buttons,tags,terminal_command,terminal_output")
      .eq("id", "default")
      .maybeSingle();
    setLoading(false);
    if (error) {
      say("err", `加载 Hero 内容失败：${error.message}（若表不存在，请先执行 migration 018）`);
      return;
    }
    if (data) {
      const row = data as HeroContent;
      const merged: HeroContent = {
        eyebrow: typeof row.eyebrow === "string" ? row.eyebrow : DEFAULT_HERO.eyebrow,
        title_plain: typeof row.title_plain === "string" ? row.title_plain : DEFAULT_HERO.title_plain,
        title_grad: typeof row.title_grad === "string" ? row.title_grad : DEFAULT_HERO.title_grad,
        subtitle: typeof row.subtitle === "string" ? row.subtitle : DEFAULT_HERO.subtitle,
        buttons: Array.isArray(row.buttons) && row.buttons.length ? (row.buttons as HeroButton[]) : DEFAULT_BUTTONS,
        tags: Array.isArray(row.tags) && row.tags.length ? (row.tags as string[]) : DEFAULT_HERO.tags,
        terminal_command: typeof row.terminal_command === "string" ? row.terminal_command : DEFAULT_HERO.terminal_command,
        terminal_output: typeof row.terminal_output === "string" ? row.terminal_output : DEFAULT_HERO.terminal_output,
      };
      setSaved(merged);
      setDraft(toDraft(merged));
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField<K extends keyof HeroContent>(key: K, value: HeroContent[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setButton(i: number, patch: Partial<HeroButton>) {
    setDraft((d) => {
      const buttons = d.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b));
      return { ...d, buttons };
    });
  }

  async function save() {
    if (!supabase || !configured) return;
    const tags = draft.tagsText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
    const payload = {
      id: "default",
      eyebrow: draft.eyebrow,
      title_plain: draft.title_plain,
      title_grad: draft.title_grad,
      subtitle: draft.subtitle,
      buttons: draft.buttons,
      tags: tags.length ? tags : DEFAULT_HERO.tags,
      terminal_command: draft.terminal_command,
      terminal_output: draft.terminal_output,
    };
    setSaving(true);
    const { error } = await supabase.from("hero_content").upsert(payload);
    setSaving(false);
    if (error) {
      say("err", `保存 Hero 失败：${error.message}`);
      return;
    }
    const next: HeroContent = { ...payload, tags: payload.tags };
    setSaved(next);
    setDraft(toDraft(next));
    // 保存后自动触发一次部署（与文章保存后自动部署一致），约 2 分钟上线。
    const dep = await triggerDeploy();
    if (dep.ok) {
      say("ok", "Hero 已保存，正在重新部署，约 2 分钟后上线。");
    } else {
      say("err", `Hero 已保存，但自动部署触发失败：${dep.error}。改动会随下次定时重建（10:00 / 15:00 / 22:00）上线。`);
    }
  }

  function cancel() {
    setDraft(toDraft(saved));
  }

  function restoreDefault() {
    setConfirm({
      message: "确定恢复 Hero 为默认文案吗？这会覆盖当前草稿（未保存），需点「保存」才写库。",
      onYes: () => {
        setDraft(toDraft(DEFAULT_HERO));
        setConfirm(null);
      },
    });
  }

  if (!configured) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>首页 Hero</h3>
        <p style={{ color: "#929dab", fontSize: 13, margin: 0 }}>
          Supabase 未配置，仅预览内置默认 Hero，不可保存。配置后可在此编辑眉题、标题、副标题、按钮、标签与终端文字。
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>首页 Hero</h3>
          <a className="button secondary" href="/" target="_blank" rel="noopener noreferrer">
            在新标签页查看首页 ↗
          </a>
        </div>
        <p style={{ color: "#929dab", fontSize: 12, margin: "8px 0 0", lineHeight: 1.7 }}>
          改动保存在 Supabase hero_content 表。首页是构建时静态生成，保存后自动触发一次部署，约 2 分钟后上线。
          {dirty ? " 当前有未保存的改动。" : ""}
          {loading ? " 加载中…" : ""}
          {loaded ? "" : ""}
        </p>
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
        <div>
          <label style={labelStyle}>眉题（小字，如 DIGITAL UNIVERSE · EST. 2026）</label>
          <input style={inputStyle} value={draft.eyebrow} onChange={(e) => setField("eyebrow", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>标题 · 普通段（如 Explore ）</label>
            <input style={inputStyle} value={draft.title_plain} onChange={(e) => setField("title_plain", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>标题 · 渐变段（如 Beyond.）</label>
            <input style={inputStyle} value={draft.title_grad} onChange={(e) => setField("title_grad", e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>副标题</label>
          <textarea
            style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
            value={draft.subtitle}
            onChange={(e) => setField("subtitle", e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>按钮（最多 3 个；样式 primary 为亮色主按钮，secondary 为暗色）</label>
          <div style={{ display: "grid", gap: 10 }}>
            {draft.buttons.map((b, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px", gap: 8 }}>
                <input
                  style={inputStyle}
                  value={b.label}
                  placeholder="按钮文案"
                  onChange={(e) => setButton(i, { label: e.target.value })}
                />
                <input
                  style={inputStyle}
                  value={b.href}
                  placeholder="链接，如 /blog/ 或 #universe"
                  onChange={(e) => setButton(i, { href: e.target.value })}
                />
                <select
                  style={inputStyle}
                  value={b.style}
                  onChange={(e) => setButton(i, { style: e.target.value as "primary" | "secondary" })}
                >
                  <option value="primary">primary（亮色）</option>
                  <option value="secondary">secondary（暗色）</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>标签（每行一个，最多 8 个；显示在按钮下方）</label>
          <textarea
            style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
            value={draft.tagsText}
            onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>终端命令（如 outai --about）</label>
            <input
              style={inputStyle}
              value={draft.terminal_command}
              onChange={(e) => setField("terminal_command", e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>终端输出（命令打完后淡入显示）</label>
            <input
              style={inputStyle}
              value={draft.terminal_output}
              onChange={(e) => setField("terminal_output", e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button primary" onClick={save} disabled={saving || !dirty}>
            {saving ? "保存中…" : "保存 Hero"}
          </button>
          <button className="button secondary" onClick={cancel} disabled={!dirty}>
            取消
          </button>
          <button className="button secondary" onClick={restoreDefault}>
            恢复默认
          </button>
        </div>
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
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
