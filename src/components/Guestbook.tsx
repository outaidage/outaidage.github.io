import React, { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

// 留言板（数字宇宙门户加固版）：
// - 仅显示已审核（approved=true）的留言，置顶（pinned）在最前。
// - 垃圾过滤：长度上限 500 字、链接不超过 2 条、常见垃圾关键词拒绝。
// - 频率限制：同一浏览器 60 秒内只能提交 1 条（localStorage 时间戳）。
// - 防注入：留言用 React 文本渲染（不注入 HTML），写入走 Supabase 参数化查询。
// - 数据库另有 CHECK 约束（message <= 500 字）作为底线。
type Entry = { id:string; name:string; message:string; created_at:string; pinned?: boolean };

const RATE_LIMIT_MS = 60_000;
const RATE_KEY = "outai-guestbook-last-submit";
const MAX_MESSAGE = 500;
const MAX_LINKS = 2;
// 常见垃圾关键词（小写匹配）。
const SPAM_WORDS = ["casino", "viagra", "crypto giveaway", "free bitcoin", "免费领", "加微信", "刷单", "代开发票"];

function spamReason(name: string, message: string): string | null {
  if (message.length > MAX_MESSAGE) return `留言不能超过 ${MAX_MESSAGE} 字。`;
  const links = (message.match(/https?:\/\/|www\./gi) || []).length;
  if (links > MAX_LINKS) return `留言中链接不能超过 ${MAX_LINKS} 条。`;
  const lower = `${name} ${message}`.toLowerCase();
  for (const w of SPAM_WORDS) {
    if (lower.includes(w)) return "留言包含不允许的内容，请修改后重试。";
  }
  return null;
}

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
    supabase.from("guestbook_entries").select("id,name,message,created_at,pinned").eq("approved",true).order("pinned",{ascending:false}).order("created_at",{ascending:false}).then(({data,error})=>{
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
    const spam = spamReason(name.trim(), message.trim());
    if (spam) { setNotice(spam); return; }
    const last = Number(localStorage.getItem(RATE_KEY) || "0");
    const wait = RATE_LIMIT_MS - (Date.now() - last);
    if (wait > 0) { setNotice(`提交太频繁，请 ${Math.ceil(wait / 1000)} 秒后再试。`); return; }
    setSubmitting(true);
    const {error} = await supabase.from("guestbook_entries").insert({name:name.trim(), message:message.trim()});
    setSubmitting(false);
    if (error) { setNotice(`提交失败：${error.message}`); return; }
    localStorage.setItem(RATE_KEY, String(Date.now()));
    setName(""); setMessage("");
    setNotice("留言已提交，等待审核后显示。");
  }
  return <div style={{display:"grid",gap:16}}>
    <form className="card" onSubmit={submit} style={{display:"grid",gap:10}}>
      <h3>签到留言</h3>
      <input className="field" placeholder="你的名字" value={name} onChange={e=>setName(e.target.value)} maxLength={50}/>
      <textarea className="field" rows={4} placeholder="写点什么…" value={message} onChange={e=>setMessage(e.target.value)} maxLength={MAX_MESSAGE}/>
      <div style={{fontSize:11,color:"#929dab",textAlign:"right"}}>{message.length}/{MAX_MESSAGE}</div>
      <button className="button primary" disabled={submitting}>{submitting?"提交中…":"提交留言"}</button>
      {notice && <p style={{color:"#61edff",fontSize:12}}>{notice}</p>}
      <p style={{color:"#929dab",fontSize:12}}>留言需要管理员审核后才会公开显示。请不要留下敏感个人信息。</p>
    </form>
    {loading ? <div className="card">正在加载留言…</div>
    : error ? <div className="card">加载失败：{error}</div>
    : !entries.length ? <div className="empty-state">还没有留言，来做第一个留言的人吧。</div>
    : <div className="card-grid">{entries.map(en=><div key={en.id} className="card">
        <div className="card-kicker">{en.name} · {new Date(en.created_at).toLocaleDateString("zh-CN")}{en.pinned ? <span style={{color:"#f2c94c",marginLeft:6}}>置顶</span> : null}</div>
        <p style={{whiteSpace:"pre-wrap"}}>{en.message}</p>
      </div>)}</div>}
  </div>;
}
