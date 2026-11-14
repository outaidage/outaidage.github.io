import React, { useEffect, useMemo, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type RecLink = { id:string; title:string; url:string; description:string|null; category:string|null; sort_order:number };

export default function RecommendedLinks(){
  const [links,setLinks] = useState<RecLink[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [cat,setCat] = useState<string>("全部");
  useEffect(()=>{
    if (!hasSupabaseConfig || !supabase) { setLoading(false); return; }
    supabase.from("recommended_links").select("id,title,url,description,category,sort_order").order("sort_order",{ascending:true}).order("created_at",{ascending:false}).then(({data,error})=>{
      if (error) setError(error.message);
      else setLinks((data||[]) as RecLink[]);
      setLoading(false);
    });
  },[]);
  const cats = useMemo(()=>{
    const s = new Set<string>();
    links.forEach(l=>{ if(l.category) s.add(l.category); });
    return ["全部", ...Array.from(s)];
  },[links]);
  const shown = cat==="全部" ? links : links.filter(l=>l.category===cat);
  if (loading) return <div className="card">正在加载推荐链接…</div>;
  if (error) return <div className="card">加载失败：{error}</div>;
  if (!links.length) return <div className="empty-state">还没有推荐链接。<br/>管理员可以在后台的「推荐链接」里添加。</div>;
  return <div>
    {cats.length>1 && <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
      {cats.map(c=><button key={c} className="button secondary" style={cat===c?{borderColor:"#b5f36b",color:"#b5f36b"}:{}} onClick={()=>setCat(c)}>{c}</button>)}
    </div>}
    <div className="card-grid">
      {shown.map(l=><a key={l.id} className="card" href={l.url} target="_blank" rel="noopener noreferrer">
        <div className="card-kicker">{l.category || "推荐"} ↗</div>
        <h3>{l.title}</h3>
        {l.description && <p>{l.description}</p>}
        <p style={{color:"#5b6b7d",fontSize:12,wordBreak:"break-all"}}>{l.url}</p>
      </a>)}
    </div>
    {!shown.length && <div className="empty-state">这个分类下还没有推荐链接。</div>}
  </div>;
}
