import React, { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type Bookmark = {id:string;url:string;title:string;description:string|null;note:string|null;category:string|null;is_public:boolean;is_favorite:boolean};
const inputClass = "field";
const basePath = import.meta.env.BASE_URL.replace(/\/$/,"");

export default function AdminApp() {
  const [session,setSession] = useState<any>(null);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [items,setItems] = useState<Bookmark[]>([]);
  const [tab,setTab] = useState<"bookmarks"|"articles">("bookmarks");
  const [form,setForm] = useState({url:"",title:"",description:"",note:"",category:"AI & Tools",is_public:true,is_favorite:false});
  const [article,setArticle] = useState({slug:"new-article",title:"",description:"",category:"Notes",tags:"",body:""});
  const [saving,setSaving] = useState(false);

  useEffect(()=>{
    if (!supabase) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);

  async function loadBookmarks(){
    if(!supabase) return;
    const {data,error}=await supabase.from("bookmarks").select("id,url,title,description,note,category,is_public,is_favorite").order("created_at",{ascending:false});
    if(error) setMessage(error.message); else setItems((data||[]) as Bookmark[]);
  }
  useEffect(()=>{if(session) loadBookmarks()},[session]);

  async function login(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return;
    const {error}=await supabase.auth.signInWithPassword({email,password});
    setMessage(error ? error.message : "登录成功。");
  }
  async function logout(){await supabase?.auth.signOut();setItems([])}
  async function addBookmark(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return;
    setSaving(true);setMessage("");
    const payload={...form,url:form.url.trim(),title:form.title.trim()||form.url.trim(),description:form.description||null,note:form.note||null};
    const {error}=await supabase.from("bookmarks").insert(payload);
    setSaving(false);
    if(error)setMessage(error.message);else{setMessage("书签已保存。");setForm({...form,url:"",title:"",description:"",note:""});loadBookmarks()}
  }
  async function deleteBookmark(id:string){
    if(!supabase || !confirm("确定删除这条书签？"))return;
    const {error}=await supabase.from("bookmarks").delete().eq("id",id);
    setMessage(error?error.message:"书签已删除。");loadBookmarks();
  }
  async function publishArticle(e:React.FormEvent){
    e.preventDefault();
    if(!supabase || !session)return;
    setSaving(true);setMessage("");
    const {data:{session:current}}=await supabase.auth.getSession();
    const {data,error}=await supabase.functions.invoke("github-content",{
      body:{action:"upsert",path:`src/content/blog/${article.slug.replace(/[^a-zA-Z0-9-_]/g,"-")}.md`,content:`---\ntitle: ${JSON.stringify(article.title)}\ndescription: ${JSON.stringify(article.description)}\npubDate: ${new Date().toISOString().slice(0,10)}\ncategory: ${JSON.stringify(article.category)}\ntags: [${article.tags.split(",").map(x=>JSON.stringify(x.trim())).filter(Boolean).join(", ")}]\ndraft: false\n---\n\n${article.body}\n`},
      headers: current?.access_token ? {Authorization:`Bearer ${current.access_token}`} : {}
    });
    setSaving(false);
    setMessage(error ? `发布失败：${error.message}` : `已提交 GitHub：${data?.commit || "请检查仓库与 Actions 部署状态"}`);
  }

  if(!hasSupabaseConfig)return <div className="empty-state">尚未配置 Supabase。请先复制 <code>.env.example</code> 为 <code>.env</code>，填写公开项目 URL 和 anon key，再重新启动网站。</div>;
  if(!session)return <div className="card" style={{maxWidth:440}}>
    <div className="eyebrow">ADMIN AUTHENTICATION</div><h3>管理员登录</h3>
    <form onSubmit={login} style={{display:"grid",gap:12}}>
      <input className={inputClass} type="email" required placeholder="管理员邮箱" value={email} onChange={e=>setEmail(e.target.value)}/>
      <input className={inputClass} type="password" required placeholder="密码" value={password} onChange={e=>setPassword(e.target.value)}/>
      <button className="button primary" type="submit">登录后台 ↗</button>
    </form>
    {message&&<p>{message}</p>}
    <p style={{color:"#929dab",fontSize:12}}>请在 Supabase 后台手动创建管理员用户，并关闭公开注册。</p>
  </div>;

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:20}}>
      <div style={{display:"flex",gap:8}}>
        <button className={`button ${tab==="bookmarks"?"primary":"secondary"}`} onClick={()=>setTab("bookmarks")}>书签管理</button>
        <button className={`button ${tab==="articles"?"primary":"secondary"}`} onClick={()=>setTab("articles")}>文章发布</button>
      </div>
      <button className="button secondary" onClick={logout}>退出登录</button>
    </div>
    {tab==="bookmarks" ? <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
      <form className="card" onSubmit={addBookmark} style={{display:"grid",gap:10}}>
        <h3>添加书签</h3>
        <input className={inputClass} type="url" required placeholder="https://example.com" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/>
        <input className={inputClass} placeholder="标题（可选）" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
        <input className={inputClass} placeholder="描述" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
        <textarea className={inputClass} placeholder="个人备注" rows={3} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/>
        <select className={inputClass} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
          {["AI & Tools","Development","Networking","Design","Productivity","Resources","Interesting"].map(x=><option>{x}</option>)}
        </select>
        <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={form.is_public} onChange={e=>setForm({...form,is_public:e.target.checked})}/> 公开书签</label>
        <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={form.is_favorite} onChange={e=>setForm({...form,is_favorite:e.target.checked})}/> 精选书签</label>
        <button className="button primary" disabled={saving}>{saving?"保存中…":"保存书签"}</button>
      </form>
      <div className="card" style={{gridColumn:"span 1"}}>
        <h3>现有书签 ({items.length})</h3>
        <div style={{display:"grid",gap:12}}>
          {items.map(x=><div key={x.id} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong style={{fontSize:13}}>{x.title}</strong><button onClick={()=>deleteBookmark(x.id)} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button></div>
            <div style={{fontSize:11,color:"#929dab",marginTop:5}}>{x.is_public?"公开":"私人"} · {x.category} · {x.url}</div>
          </div>)}
          {!items.length&&<p style={{color:"#929dab",fontSize:12}}>还没有书签。</p>}
        </div>
      </div>
    </div> : <form className="card" onSubmit={publishArticle} style={{display:"grid",gap:12,maxWidth:850}}>
      <h3>网页文章编辑器</h3>
      <input className={inputClass} required placeholder="文章标题" value={article.title} onChange={e=>setArticle({...article,title:e.target.value})}/>
      <input className={inputClass} required placeholder="URL slug，例如 ai-tools-notes" value={article.slug} onChange={e=>setArticle({...article,slug:e.target.value})}/>
      <input className={inputClass} placeholder="文章简介" value={article.description} onChange={e=>setArticle({...article,description:e.target.value})}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <input className={inputClass} placeholder="分类" value={article.category} onChange={e=>setArticle({...article,category:e.target.value})}/>
        <input className={inputClass} placeholder="标签，逗号分隔" value={article.tags} onChange={e=>setArticle({...article,tags:e.target.value})}/>
      </div>
      <textarea className={inputClass} rows={18} placeholder="使用 Markdown 编写正文…" value={article.body} onChange={e=>setArticle({...article,body:e.target.value})}/>
      <button className="button primary" disabled={saving}>{saving?"提交中…":"提交到 GitHub 并发布"}</button>
      <p style={{color:"#929dab",fontSize:12}}>发布操作通过 Supabase Edge Function 调用 GitHub API。部署密钥前，请完成 README 中的服务端配置。</p>
    </form>}
    {message&&<div className="empty-state" style={{marginTop:18}}>{message}</div>}
  </div>;
}
