import React, { useEffect, useMemo, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type Bookmark = {
  id: string; url: string; title: string; description: string | null;
  category: string | null; favicon: string | null; tags?: string[];
};

export default function BookmarkExplorer() {
  const [items,setItems] = useState<Bookmark[]>([]);
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("全部");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!hasSupabaseConfig || !supabase) { setLoading(false); return; }
      const { data, error } = await supabase.from("public_bookmarks")
        .select("id,url,title,description,category,favicon,tags")
        .order("created_at",{ascending:false});
      if (!active) return;
      if (error) setError(error.message);
      else setItems((data || []) as Bookmark[]);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  },[]);

  const categories = useMemo(() => ["全部",...Array.from(new Set(items.map(x=>x.category).filter(Boolean) as string[]))], [items]);
  const filtered = items.filter(x => (category==="全部" || x.category===category) &&
    `${x.title} ${x.description||""} ${x.url} ${(x.tags||[]).join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  if (!hasSupabaseConfig) return <div className="empty-state">书签数据库尚未连接。<br/>完成 Supabase 配置后，这里会自动显示公开书签。</div>;
  return <div>
    <div className="toolbar">
      <input className="field" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索标题、网址、描述或标签…" aria-label="搜索书签"/>
      <select className="field" value={category} onChange={e=>setCategory(e.target.value)} aria-label="分类">
        {categories.map(c=><option key={c}>{c}</option>)}
      </select>
    </div>
    {loading && <div className="empty-state">正在加载书签…</div>}
    {error && <div className="empty-state">读取书签失败：{error}</div>}
    {!loading && !error && filtered.length===0 && <div className="empty-state">没有找到书签。你可以在管理后台添加第一条收藏。</div>}
    <div className="card-grid">
      {filtered.map(item=><a className="card" data-tilt key={item.id} href={item.url} target="_blank" rel="noopener noreferrer">
        <div className="card-kicker">{item.category || "UNCATEGORIZED"}</div>
        <h3>{item.title}</h3><p>{item.description || item.url}</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:14}}>{(item.tags||[]).map(t=><span className="tag" key={t}>{t}</span>)}</div>
      </a>)}
    </div>
  </div>;
}
