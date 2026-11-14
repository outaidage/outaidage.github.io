import React, { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type Comment = { id:string; name:string; message:string; created_at:string };

export default function Comments({ slug }: { slug: string }){
  const [comments,setComments] = useState<Comment[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [name,setName] = useState("");
  const [message,setMessage] = useState("");
  const [submitting,setSubmitting] = useState(false);
  const [notice,setNotice] = useState("");
  function load(){
    if (!hasSupabaseConfig || !supabase) { setLoading(false); return; }
    supabase.from("comments").select("id,name,message,created_at").eq("article_slug",slug).eq("approved",true).order("created_at",{ascending:true}).then(({data,error})=>{
      if (error) setError(error.message);
      else setComments((data||[]) as Comment[]);
      setLoading(false);
    });
  }
  useEffect(load,[slug]);
  async function submit(e: React.FormEvent){
    e.preventDefault();
    if (!supabase) return;
    if (!name.trim() || !message.trim()) { setNotice("请填写名字和评论。"); return; }
    if (message.trim().length > 1000) { setNotice("评论不能超过 1000 字。"); return; }
    setSubmitting(true);
    const {error} = await supabase.from("comments").insert({article_slug: slug, name:name.trim(), message:message.trim()});
    setSubmitting(false);
    if (error) { setNotice(`提交失败：${error.message}`); return; }
    setName(""); setMessage("");
    setNotice("评论已提交，等待审核后显示。");
  }
  return <section className="section">
    <div className="section-head"><h2>COMMENTS / 评论 ({comments.length})</h2></div>
    {loading ? <div className="card">正在加载评论…</div>
    : error ? <div className="card">加载失败：{error}</div>
    : !comments.length ? <div className="empty-state">还没有评论，来做第一个评论的人吧。</div>
    : <div style={{display:"grid",gap:12}}>{comments.map(c=><div key={c.id} className="card">
        <div className="card-kicker">{c.name} · {new Date(c.created_at).toLocaleDateString("zh-CN")}</div>
        <p style={{whiteSpace:"pre-wrap"}}>{c.message}</p>
      </div>)}</div>}
    <form className="card" onSubmit={submit} style={{display:"grid",gap:10,marginTop:16}}>
      <h3>发表评论</h3>
      <input className="field" placeholder="你的名字" value={name} onChange={e=>setName(e.target.value)} maxLength={50}/>
      <textarea className="field" rows={4} placeholder="写点什么…" value={message} onChange={e=>setMessage(e.target.value)} maxLength={1000}/>
      <button className="button primary" disabled={submitting}>{submitting?"提交中…":"提交评论"}</button>
      {notice && <p style={{color:"#b5f36b",fontSize:12}}>{notice}</p>}
      <p style={{color:"#929dab",fontSize:12}}>评论需要管理员审核后才会公开显示。请不要留下敏感个人信息。</p>
    </form>
  </section>;
}
