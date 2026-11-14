import React, { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type Entry = { id:string; name:string; message:string; created_at:string };

export default function Guestbook(){
  const [entries,setEntries] = useState<Entry[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [name,setName] = useState("");
  const [message,setMessage] = useState("");
  const [submitting,setSubmitting] = useState(false);
  const [notice,setNotice] = useState("");
  function load(){
    if (!hasSupabaseConfig || !supabase) { setLoading(false); return; }
    supabase.from("guestbook_entries").select("id,name,message,created_at").eq("approved",true).order("created_at",{ascending:false}).then(({data,error})=>{
      if (error) setError(error.message);
      else setEntries((data||[]) as Entry[]);
      setLoading(false);
    });
  }
  useEffect(load,[]);
  async function submit(e: React.FormEvent){
    e.preventDefault();
    if (!supabase) return;
    if (!name.trim() || !message.trim()) { setNotice("请填写名字和留言。"); return; }
    if (message.trim().length > 1000) { setNotice("留言不能超过 1000 字。"); return; }
    setSubmitting(true);
    const {error} = await supabase.from("guestbook_entries").insert({name:name.trim(), message:message.trim()});
    setSubmitting(false);
    if (error) { setNotice(`提交失败：${error.message}`); return; }
    setName(""); setMessage("");
    setNotice("留言已提交，等待审核后显示。");
  }
  return <div style={{display:"grid",gap:16}}>
    <form className="card" onSubmit={submit} style={{display:"grid",gap:10}}>
      <h3>签到留言</h3>
      <input className="field" placeholder="你的名字" value={name} onChange={e=>setName(e.target.value)} maxLength={50}/>
      <textarea className="field" rows={4} placeholder="写点什么…" value={message} onChange={e=>setMessage(e.target.value)} maxLength={1000}/>
      <button className="button primary" disabled={submitting}>{submitting?"提交中…":"提交留言"}</button>
      {notice && <p style={{color:"#61edff",fontSize:12}}>{notice}</p>}
      <p style={{color:"#929dab",fontSize:12}}>留言需要管理员审核后才会公开显示。请不要留下敏感个人信息。</p>
    </form>
    {loading ? <div className="card">正在加载留言…</div>
    : error ? <div className="card">加载失败：{error}</div>
    : !entries.length ? <div className="empty-state">还没有留言，来做第一个留言的人吧。</div>
    : <div className="card-grid">{entries.map(en=><div key={en.id} className="card">
        <div className="card-kicker">{en.name} · {new Date(en.created_at).toLocaleDateString("zh-CN")}</div>
        <p style={{whiteSpace:"pre-wrap"}}>{en.message}</p>
      </div>)}</div>}
  </div>;
}
