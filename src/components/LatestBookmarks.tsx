// LatestBookmarks.tsx — 首页「LATEST BOOKMARKS」栏目。
// 以构建时传入的书签为初始内容，挂载后从 Supabase 拉取最新公开书签，
// 这样管理员在后台添加书签后，首页下次打开即自动显示，无需重新部署。
// （之前这里只读构建时数据，部署后新加的书签首页一直显示“还没有公开书签”。）
// 拉取失败时保留初始内容，不显示错误、不造假数据。
// 同时刷新统计区里的公开书签数（#stat-bookmarks-num），保持与栏目一致。
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type LatestBookmark = {
  id: string;
  title: string;
  url: string;
  category: string;
};

export default function LatestBookmarks({
  initial,
}: {
  initial: LatestBookmark[];
}) {
  const [items, setItems] = useState<LatestBookmark[]>(initial);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("public_bookmarks")
      .select("id,title,url,category")
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setItems(data as LatestBookmark[]);
      });
    supabase
      .from("public_bookmarks")
      .select("id", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (cancelled || error || typeof count !== "number") return;
        const el = document.getElementById("stat-bookmarks-num");
        if (el) el.textContent = String(count);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className="empty-state">
        还没有公开书签。
        <br />
        在后台 → 书签管理中添加。
      </div>
    );
  }

  return (
    <div className="card-grid">
      {items.map((b, i) => (
        <a
          key={b.id}
          className="card"
          data-tilt
          data-reveal
          style={{ "--i": i } as React.CSSProperties}
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="card-kicker">{b.category || "书签"}</div>
          <h3>{b.title}</h3>
          <p style={{ wordBreak: "break-all" }}>{b.url}</p>
        </a>
      ))}
    </div>
  );
}
