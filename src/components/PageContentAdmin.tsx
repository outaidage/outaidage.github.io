// PageContentAdmin.tsx — 页面内容管理（后台「页面内容」标签页）。
// 编辑关于我 / Now / 联系方式 三个静态页：页头标题与副标题，
// 关于页的段落（标题+正文）、Now 的卡片（标签+标题+描述）、
// 联系页的条目（标题+显示文字+链接+备注）。
// 编辑全部在本地草稿里，点「保存」才写库，点「取消」丢弃草稿；
// 未保存的改动绝不假装已生效。Supabase 未配置时只读本地默认值并明确
// 提示不可保存（不伪造保存成功）。
// 注意：这些页是构建时静态生成，保存后自动触发一次部署，约 2 分钟上线；
// 若自动部署触发失败，改动会随下次定时重建（10:00 / 15:00 / 22:00）上线。
import { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import { DEFAULT_PAGES, type PageContent, type PageItem, type PageSection } from "@/lib/page-content";
import { triggerDeploy } from "@/lib/trigger-deploy";

type PageId = "about" | "now" | "contact";

const PAGE_LABELS: Record<PageId, string> = { about: "关于我", now: "Now", contact: "联系方式" };

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

function clonePage(p: PageContent): PageContent {
  return {
    ...p,
    sections: p.sections.map((s) => ({ ...s })),
    items: p.items.map((i) => ({ ...i })),
  };
}

export default function PageContentAdmin({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [pageId, setPageId] = useState<PageId>("about");
  const [pages, setPages] = useState<Record<PageId, PageContent>>({
    about: clonePage(DEFAULT_PAGES.about),
    now: clonePage(DEFAULT_PAGES.now),
    contact: clonePage(DEFAULT_PAGES.contact),
  });
  const [draft, setDraft] = useState<PageContent>(clonePage(DEFAULT_PAGES.about));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; onYes: () => void } | null>(null);

  const configured = hasSupabaseConfig;
  const saved = pages[pageId];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from("page_content").select("id,title,subtitle,sections,items");
    setLoading(false);
    if (error) {
      say("err", `加载页面内容失败：${error.message}（若表不存在，请先执行 migration 019）`);
      return;
    }
    const next = { ...pages };
    for (const row of (data ?? []) as PageContent[]) {
      if (row.id === "about" || row.id === "now" || row.id === "contact") {
        next[row.id as PageId] = {
          id: row.id,
          title: typeof row.title === "string" ? row.title : DEFAULT_PAGES[row.id as PageId].title,
          subtitle: typeof row.subtitle === "string" ? row.subtitle : DEFAULT_PAGES[row.id as PageId].subtitle,
          sections: Array.isArray(row.sections) ? (row.sections as PageSection[]) : [],
          items: Array.isArray(row.items) ? (row.items as PageItem[]) : [],
        };
      }
    }
    setPages(next);
    setDraft(clonePage(next[pageId]));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickPage(id: PageId) {
    setPageId(id);
    setDraft(clonePage(pages[id]));
  }

  function setField<K extends keyof PageContent>(key: K, value: PageContent[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setSection(i: number, patch: Partial<PageSection>) {
    setDraft((d) => ({ ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }

  function setItem(i: number, patch: Partial<PageItem>) {
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  }

  async function save() {
    if (!supabase || !configured) return;
    setSaving(true);
    const { error } = await supabase.from("page_content").upsert({
      id: pageId,
      title: draft.title,
      subtitle: draft.subtitle,
      sections: draft.sections,
      items: draft.items,
    });
    setSaving(false);
    if (error) {
      say("err", `保存页面内容失败：${error.message}`);
      return;
    }
    setPages((p) => ({ ...p, [pageId]: clonePage(draft) }));
    // 保存后自动触发一次部署（与文章保存后自动部署一致），约 2 分钟上线。
    const dep = await triggerDeploy();
    if (dep.ok) {
      say("ok", `${PAGE_LABELS[pageId]}已保存，正在重新部署，约 2 分钟后上线。`);
    } else {
      say("err", `${PAGE_LABELS[pageId]}已保存，但自动部署触发失败：${dep.error}。改动会随下次定时重建（10:00 / 15:00 / 22:00）上线。`);
    }
  }

  function cancel() {
    setDraft(clonePage(saved));
  }

  function restoreDefault() {
    setConfirm({
      message: `确定恢复「${PAGE_LABELS[pageId]}」为默认内容吗？这会覆盖当前草稿（未保存），需点「保存」才写库。`,
      onYes: () => {
        setDraft(clonePage(DEFAULT_PAGES[pageId]));
        setConfirm(null);
      },
    });
  }

  if (!configured) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>页面内容</h3>
        <p style={{ color: "#929dab", fontSize: 13, margin: 0 }}>
          Supabase 未配置，仅预览内置默认页面内容，不可保存。配置后可在此编辑关于我、Now、联系方式。
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>页面内容</h3>
          <a className="button secondary" href={`/${pageId === "about" ? "about" : pageId}/`} target="_blank" rel="noopener noreferrer">
            查看该页面 ↗
          </a>
        </div>
        <p style={{ color: "#929dab", fontSize: 12, margin: "8px 0 0", lineHeight: 1.7 }}>
          页面是构建时静态生成，保存后自动触发一次部署，约 2 分钟后上线。
          {dirty ? " 当前有未保存的改动。" : ""}
          {loading ? " 加载中…" : ""}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {(Object.keys(PAGE_LABELS) as PageId[]).map((id) => (
            <button key={id} className={`button ${pageId === id ? "primary" : "secondary"}`} onClick={() => pickPage(id)}>
              {PAGE_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>页头标题（如 关于这里.）</label>
            <input style={inputStyle} value={draft.title} onChange={(e) => setField("title", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>页头副标题</label>
            <input style={inputStyle} value={draft.subtitle} onChange={(e) => setField("subtitle", e.target.value)} />
          </div>
        </div>

        {pageId === "about" ? (
          <div>
            <label style={labelStyle}>段落（每段一个标题 + 一段正文）</label>
            <div style={{ display: "grid", gap: 10 }}>
              {draft.sections.map((s, i) => (
                <div key={i} style={{ display: "grid", gap: 6, border: "1px solid #1e293b", borderRadius: 8, padding: 10 }}>
                  <input style={inputStyle} value={s.heading} placeholder="段落标题" onChange={(e) => setSection(i, { heading: e.target.value })} />
                  <textarea
                    style={{ ...inputStyle, minHeight: 56, resize: "vertical" }}
                    value={s.text}
                    placeholder="正文"
                    onChange={(e) => setSection(i, { text: e.target.value })}
                  />
                  <div>
                    <button className="button secondary" onClick={() => setDraft((d) => ({ ...d, sections: d.sections.filter((_, j) => j !== i) }))}>
                      删除本段
                    </button>
                  </div>
                </div>
              ))}
              <button className="button secondary" onClick={() => setDraft((d) => ({ ...d, sections: [...d.sections, { heading: "", text: "" }] }))}>
                + 添加段落
              </button>
            </div>
          </div>
        ) : null}

        {pageId === "now" ? (
          <div>
            <label style={labelStyle}>卡片（每张一个小标签 + 标题 + 描述）</label>
            <div style={{ display: "grid", gap: 10 }}>
              {draft.items.map((it, i) => (
                <div key={i} style={{ display: "grid", gap: 6, border: "1px solid #1e293b", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                    <input style={inputStyle} value={it.kicker ?? ""} placeholder="小标签，如 LEARNING" onChange={(e) => setItem(i, { kicker: e.target.value })} />
                    <input style={inputStyle} value={it.title ?? ""} placeholder="标题" onChange={(e) => setItem(i, { title: e.target.value })} />
                  </div>
                  <textarea
                    style={{ ...inputStyle, minHeight: 48, resize: "vertical" }}
                    value={it.description ?? ""}
                    placeholder="描述"
                    onChange={(e) => setItem(i, { description: e.target.value })}
                  />
                  <div>
                    <button className="button secondary" onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}>
                      删除本卡
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="button secondary"
                onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { kicker: "", title: "", description: "" }] }))}
              >
                + 添加卡片
              </button>
            </div>
          </div>
        ) : null}

        {pageId === "contact" ? (
          <div>
            <label style={labelStyle}>条目（每条一个标题 + 显示文字 + 链接 + 备注）</label>
            <div style={{ display: "grid", gap: 10 }}>
              {draft.items.map((it, i) => (
                <div key={i} style={{ display: "grid", gap: 6, border: "1px solid #1e293b", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input style={inputStyle} value={it.heading ?? ""} placeholder="标题，如 邮箱" onChange={(e) => setItem(i, { heading: e.target.value })} />
                    <input style={inputStyle} value={it.label ?? ""} placeholder="显示文字" onChange={(e) => setItem(i, { label: e.target.value })} />
                  </div>
                  <input style={inputStyle} value={it.href ?? ""} placeholder="链接，如 mailto:… 或 https://…" onChange={(e) => setItem(i, { href: e.target.value })} />
                  <input style={inputStyle} value={it.note ?? ""} placeholder="备注（可空；若为链接则显示为可点击文字）" onChange={(e) => setItem(i, { note: e.target.value })} />
                  <div>
                    <button className="button secondary" onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}>
                      删除本条
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="button secondary"
                onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { heading: "", label: "", href: "", note: "" }] }))}
              >
                + 添加条目
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button primary" onClick={save} disabled={saving || !dirty}>
            {saving ? "保存中…" : "保存"}
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
