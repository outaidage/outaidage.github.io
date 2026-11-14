// ArticlePreview.tsx — 3.0 P0 预览与发布工作流。
// 在后台编辑文章时，把当前表单内容渲染成与博客正文一致的预览
// （标题、分类、日期、阅读时长 + Markdown 正文）。
// 正文用 marked 转 HTML，再用 DOMPurify 清洗后注入，避免 raw HTML 注入。
import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

export type ArticlePreviewData = {
  title: string;
  description: string;
  category: string;
  tags: string;
  pubDate: string;
  cover: string;
  draft: boolean;
  body: string;
};

function readingMinutes(body: string): number {
  const words = body.replace(/[#>*`\[\]()!]/g, " ").split(/\s+/).filter(Boolean).length;
  const chars = body.replace(/\s/g, "").length;
  return Math.max(1, Math.round(Math.max(words, chars / 2) / 200));
}

export default function ArticlePreview({ article }: { article: ArticlePreviewData }) {
  const html = useMemo(() => {
    const raw = marked.parse(article.body || "*（正文为空）*", { breaks: true }) as string;
    return DOMPurify.sanitize(raw);
  }, [article.body]);

  const tags = article.tags.split(",").map((x) => x.trim()).filter(Boolean);
  const isFuture = article.pubDate && new Date(article.pubDate).getTime() > Date.now();

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#929dab", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ border: "1px solid #29313c", borderRadius: 999, padding: "2px 8px", color: article.draft ? "#fbbf24" : "#7dffce" }}>
          {article.draft ? "草稿（不公开）" : isFuture ? `定时发布 · ${article.pubDate}` : "已发布"}
        </span>
        {article.category ? <span>{article.category}</span> : null}
        {article.pubDate ? <span>{article.pubDate}</span> : null}
        <span>约 {readingMinutes(article.body)} 分钟</span>
      </div>
      <h2 style={{ fontSize: 24, margin: 0, lineHeight: 1.3 }}>{article.title || "（无标题）"}</h2>
      {article.description ? <p style={{ color: "#aab3c0", margin: 0 }}>{article.description}</p> : null}
      {article.cover ? <img src={article.cover} alt="封面预览" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, border: "1px solid #1e293b" }} /> : null}
      {tags.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tags.map((t) => (
            <span key={t} style={{ fontSize: 11, border: "1px solid #29313c", borderRadius: 999, padding: "2px 8px", color: "#61edff" }}>#{t}</span>
          ))}
        </div>
      ) : null}
      <div
        className="article-preview-body"
        style={{ borderTop: "1px solid #29313c", paddingTop: 12, lineHeight: 1.8, wordBreak: "break-word" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .article-preview-body h1,.article-preview-body h2,.article-preview-body h3{line-height:1.4;margin:1em 0 .5em}
        .article-preview-body p{margin:.8em 0}
        .article-preview-body a{color:#61edff}
        .article-preview-body code{background:#0a0d20;border:1px solid #1e293b;border-radius:4px;padding:1px 5px;font-size:.9em}
        .article-preview-body pre{background:#0a0d20;border:1px solid #1e293b;border-radius:8px;padding:12px;overflow:auto}
        .article-preview-body pre code{background:none;border:0;padding:0}
        .article-preview-body blockquote{border-left:3px solid #61edff;margin:1em 0;padding:.2em 1em;color:#aab3c0}
        .article-preview-body img{max-width:100%;border-radius:8px}
        .article-preview-body ul,.article-preview-body ol{padding-left:1.5em}
      `}</style>
    </div>
  );
}
