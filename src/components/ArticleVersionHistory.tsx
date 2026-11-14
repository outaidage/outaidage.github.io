// ArticleVersionHistory.tsx — 3.0 P0 文章版本管理。
// 每次在后台保存文章成功后，AdminApp 会把完整 Markdown 存为一条版本快照
// （article_versions 表）。这里列出某篇文章的全部版本，支持查看、恢复、下载。
// 恢复 = 把旧版本内容载入编辑器，点保存后产生一条新版本，旧版本永不被覆盖。
// 若 article_versions 表尚未创建（未执行 008 迁移），显示配置说明，不伪造数据。
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ArticleVersion = {
  id: string;
  article_slug: string;
  title: string;
  content: string;
  version_number: number;
  created_at: string;
  created_by: string | null;
  change_note: string | null;
};

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ArticleVersionHistory({
  slug,
  refreshTick,
  onRestore,
}: {
  slug: string | null;
  refreshTick: number;
  onRestore: (version: ArticleVersion) => void;
}) {
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !supabase) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("article_versions")
      .select("id,article_slug,title,content,version_number,created_at,created_by,change_note")
      .eq("article_slug", slug)
      .order("version_number", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          if (error.code === "42P01" || /article_versions/i.test(error.message)) {
            setTableMissing(true);
          }
          return;
        }
        setTableMissing(false);
        setVersions((data || []) as ArticleVersion[]);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, refreshTick]);

  if (!slug) return null;

  if (tableMissing) {
    return (
      <div style={{ borderTop: "1px solid #29313c", paddingTop: 12, fontSize: 12, color: "#929dab" }}>
        <strong>版本历史未启用：</strong>Supabase 中还没有 <code>article_versions</code> 表。
        请在 Supabase Dashboard → SQL Editor 执行仓库里的
        <code> supabase/migrations/008_article_versions.sql</code>，然后刷新。
      </div>
    );
  }

  return (
    <div style={{ borderTop: "1px solid #29313c", paddingTop: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>版本历史（{versions.length}）</strong>
        <span style={{ fontSize: 11, color: "#929dab" }}>
          每次保存自动存一份快照；恢复会产生新版本，旧版本不会被覆盖
        </span>
      </div>
      {loading ? <p style={{ fontSize: 12, color: "#929dab" }}>正在加载版本…</p> : null}
      {!loading && versions.length === 0 ? (
        <p style={{ fontSize: 12, color: "#929dab" }}>
          还没有版本快照。保存一次文章后，这里会出现 v1。
        </p>
      ) : null}
      {versions.map((v) => (
        <div key={v.id} style={{ border: "1px solid #29313c", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>
              <strong>v{v.version_number}</strong> · {v.title}
            </span>
            <span style={{ fontSize: 11, color: "#929dab" }}>
              {new Date(v.created_at).toLocaleString("zh-CN")}
              {v.created_by ? ` · ${v.created_by}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="button secondary" onClick={() => setViewingId(viewingId === v.id ? null : v.id)}>
              {viewingId === v.id ? "收起" : "查看内容"}
            </button>
            <button type="button" className="button secondary" onClick={() => onRestore(v)}>
              恢复此版本
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => downloadMarkdown(`${slug}-v${v.version_number}.md`, v.content)}
            >
              下载 .md
            </button>
          </div>
          {viewingId === v.id ? (
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, background: "#0a0d20", border: "1px solid #1e293b", borderRadius: 8, padding: 10, maxHeight: 320, overflow: "auto", margin: 0 }}>
              {v.content}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}
