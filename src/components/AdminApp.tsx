import React, { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type Bookmark = {id:string;url:string;title:string;description:string|null;note:string|null;category:string|null;is_public:boolean;is_favorite:boolean};
type ArticleFile = {name:string;slug:string;path:string;sha:string;size:number};
type ArticleForm = {slug:string;title:string;description:string;category:string;tags:string;cover:string;seoTitle:string;seoDescription:string;featured:boolean;draft:boolean;pubDate:string;body:string};
type ConfirmTarget = {kind:"article"|"bookmark";label:string;path?:string;id?:string};
const inputClass = "field";
const basePath = import.meta.env.BASE_URL.replace(/\/$/,"");
const SLUG_RE = /^[a-zA-Z0-9_-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0,10);
const emptyArticle = (): ArticleForm => ({slug:"",title:"",description:"",category:"Notes",tags:"",cover:"",seoTitle:"",seoDescription:"",featured:false,draft:false,pubDate:today(),body:""});

// Parse the frontmatter the admin writes (values are JSON-encoded).
function parseArticle(content: string): ArticleForm {
  const lines = content.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) { if (lines[i].trim() === "---") { end = i; break; } }
  const data: Record<string, unknown> = {};
  if (end > 0) {
    for (const line of lines.slice(1, end)) {
      if (!line.trim()) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
    }
  }
  const body = end > 0 ? lines.slice(end + 1).join("\n").trim() : content;
  const tags = Array.isArray(data.tags) ? (data.tags as unknown[]).map(String).join(", ") : "";
  return {
    slug: "",
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    category: typeof data.category === "string" ? data.category : "Notes",
    tags,
    cover: typeof data.cover === "string" ? data.cover : "",
    seoTitle: typeof data.seoTitle === "string" ? data.seoTitle : "",
    seoDescription: typeof data.seoDescription === "string" ? data.seoDescription : "",
    featured: data.featured === true,
    draft: data.draft === true,
    pubDate: typeof data.pubDate === "string" ? data.pubDate : today(),
    body,
  };
}

function buildArticleMarkdown(f: ArticleForm, isEdit: boolean): string {
  const lines = ["---"];
  lines.push(`title: ${JSON.stringify(f.title)}`);
  lines.push(`description: ${JSON.stringify(f.description)}`);
  lines.push(`pubDate: ${f.pubDate}`);
  if (isEdit) lines.push(`updatedDate: ${today()}`);
  lines.push(`category: ${JSON.stringify(f.category || "Notes")}`);
  const tags = f.tags.split(",").map(x=>x.trim()).filter(Boolean);
  lines.push(`tags: [${tags.map(x=>JSON.stringify(x)).join(", ")}]`);
  lines.push(`draft: ${f.draft ? "true" : "false"}`);
  if (f.cover.trim()) lines.push(`cover: ${JSON.stringify(f.cover.trim())}`);
  if (f.seoTitle.trim()) lines.push(`seoTitle: ${JSON.stringify(f.seoTitle.trim())}`);
  if (f.seoDescription.trim()) lines.push(`seoDescription: ${JSON.stringify(f.seoDescription.trim())}`);
  if (f.featured) lines.push(`featured: true`);
  lines.push("---", "", f.body, "");
  return lines.join("\n");
}

export default function AdminApp() {
  const [session,setSession] = useState<any>(null);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [msgKind,setMsgKind] = useState<"ok"|"err">("ok");
  const [items,setItems] = useState<Bookmark[]>([]);
  const [tab,setTab] = useState<"bookmarks"|"articles">("bookmarks");
  const [form,setForm] = useState({url:"",title:"",description:"",note:"",category:"AI & Tools",is_public:true,is_favorite:false});
  const [article,setArticle] = useState<ArticleForm>(emptyArticle());
  const [editingSlug,setEditingSlug] = useState<string|null>(null);
  const [articles,setArticles] = useState<ArticleFile[]>([]);
  const [articlesLoading,setArticlesLoading] = useState(false);
  const [confirmTarget,setConfirmTarget] = useState<ConfirmTarget|null>(null);
  const [saving,setSaving] = useState(false);

  const say = (kind:"ok"|"err", text:string) => { setMsgKind(kind); setMessage(text); };

  useEffect(()=>{
    if (!supabase) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);

  async function callFunction(body: Record<string, unknown>) {
    if (!supabase) return {data:null,error:new Error("Supabase 未配置")};
    const {data:{session:current}} = await supabase.auth.getSession();
    const {data,error} = await supabase.functions.invoke("github-content",{
      body,
      headers: current?.access_token ? {Authorization:`Bearer ${current.access_token}`} : {}
    });
    return {data,error};
  }

  async function loadBookmarks(){
    if(!supabase) return;
    const {data,error}=await supabase.from("bookmarks").select("id,url,title,description,note,category,is_public,is_favorite").order("created_at",{ascending:false});
    if(error) say("err",error.message); else setItems((data||[]) as Bookmark[]);
  }
  useEffect(()=>{if(session) loadBookmarks()},[session]);

  async function loadArticles(){
    setArticlesLoading(true);
    const {data,error} = await callFunction({action:"list"});
    setArticlesLoading(false);
    if (error) { say("err",`文章列表加载失败：${error.message}`); return; }
    const files = (data as any)?.files as ArticleFile[] | undefined;
    if (!Array.isArray(files)) { say("err","文章列表返回异常，请检查 Edge Function。"); return; }
    setArticles(files);
  }
  useEffect(()=>{if(session && tab==="articles") loadArticles()},[session,tab]);

  async function login(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return;
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if (error) say("err",error.message); else say("ok","登录成功。");
  }
  async function logout(){await supabase?.auth.signOut();setItems([]);setArticles([])}
  async function addBookmark(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return;
    setSaving(true);say("ok","");
    const payload={...form,url:form.url.trim(),title:form.title.trim()||form.url.trim(),description:form.description||null,note:form.note||null};
    const {error}=await supabase.from("bookmarks").insert(payload);
    setSaving(false);
    if(error)say("err",error.message);else{say("ok","书签已保存。");setForm({...form,url:"",title:"",description:"",note:""});loadBookmarks()}
  }
  async function deleteBookmark(id:string){
    if(!supabase)return;
    const {error}=await supabase.from("bookmarks").delete().eq("id",id);
    if(error)say("err",error.message);else{say("ok","书签已删除。");loadBookmarks()}
  }
  function newArticle(){
    setEditingSlug(null);
    setArticle(emptyArticle());
  }
  async function editArticle(file: ArticleFile){
    say("ok","正在加载文章…");
    const {data,error} = await callFunction({action:"get",path:file.path});
    if (error) { say("err",`加载失败：${error.message}`); return; }
    const content = (data as any)?.content as string | undefined;
    if (typeof content !== "string") { say("err","文章内容返回异常，请检查 Edge Function。"); return; }
    const parsed = parseArticle(content);
    parsed.slug = file.slug;
    setArticle(parsed);
    setEditingSlug(file.slug);
    say("ok",`正在编辑：${file.slug}`);
  }
  async function saveArticle(e:React.FormEvent){
    e.preventDefault();
    if(!supabase || !session)return;
    const slug = article.slug.trim();
    if (!SLUG_RE.test(slug)) { say("err","slug 只能包含字母、数字、- 和 _，例如 ai-tools-notes。"); return; }
    if (!article.title.trim()) { say("err","请填写文章标题。"); return; }
    if (!DATE_RE.test(article.pubDate)) { say("err","发布日期格式应为 YYYY-MM-DD。"); return; }
    if (!article.body.trim()) { say("err","正文不能为空。"); return; }
    const isEdit = editingSlug !== null;
    if (!isEdit && articles.some(a=>a.slug===slug)) { say("err",`slug “${slug}” 已存在，请换一个 slug，或先编辑已有文章。`); return; }
    setSaving(true);say("ok","");
    const path = `src/content/blog/${slug}.md`;
    const content = buildArticleMarkdown({...article,slug}, isEdit);
    const {data,error} = await callFunction({action:"upsert",path,content});
    setSaving(false);
    if (error) { say("err",`保存失败：${error.message}`); return; }
    const commit = (data as any)?.commit as string | undefined;
    say("ok", isEdit ? `文章已更新${commit ? `（提交 ${commit.slice(0,7)}）` : ""}，部署完成后生效。` : `文章已发布${commit ? `（提交 ${commit.slice(0,7)}）` : ""}，部署完成后生效。`);
    loadArticles();
  }
  async function deleteArticle(path: string){
    const {data,error} = await callFunction({action:"delete",path});
    if (error) { say("err",`删除失败：${error.message}`); return; }
    const commit = (data as any)?.commit as string | undefined;
    say("ok",`文章已删除${commit ? `（提交 ${commit.slice(0,7)}）` : ""}，部署完成后生效。`);
    if (editingSlug && path === `src/content/blog/${editingSlug}.md`) newArticle();
    loadArticles();
  }
  async function runConfirmedDelete(){
    const t = confirmTarget;
    setConfirmTarget(null);
    if (!t) return;
    if (t.kind === "article" && t.path) await deleteArticle(t.path);
    if (t.kind === "bookmark" && t.id) await deleteBookmark(t.id);
  }

  if(!hasSupabaseConfig)return <div className="empty-state">尚未配置 Supabase。请先复制 <code>.env.example</code> 为 <code>.env</code>，填写公开项目 URL 和 anon key，再重新启动网站。</div>;
  if(!session)return <div className="card" style={{maxWidth:440}}>
    <div className="eyebrow">ADMIN AUTHENTICATION</div><h3>管理员登录</h3>
    <form onSubmit={login} style={{display:"grid",gap:12}}>
      <input className={inputClass} type="email" required placeholder="管理员邮箱" value={email} onChange={e=>setEmail(e.target.value)}/>
      <input className={inputClass} type="password" required placeholder="密码" value={password} onChange={e=>setPassword(e.target.value)}/>
      <button className="button primary" type="submit">登录后台 ↗</button>
    </form>
    {message&&<p style={{color:msgKind==="err"?"#f28b82":"#b5f36b"}}>{message}</p>}
    <p style={{color:"#929dab",fontSize:12}}>请在 Supabase 后台手动创建管理员用户，并关闭公开注册。</p>
  </div>;

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:20}}>
      <div style={{display:"flex",gap:8}}>
        <button className={`button ${tab==="bookmarks"?"primary":"secondary"}`} onClick={()=>setTab("bookmarks")}>书签管理</button>
        <button className={`button ${tab==="articles"?"primary":"secondary"}`} onClick={()=>setTab("articles")}>文章管理</button>
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
          {["AI & Tools","Development","Networking","Design","Productivity","Resources","Interesting"].map(x=><option key={x}>{x}</option>)}
        </select>
        <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={form.is_public} onChange={e=>setForm({...form,is_public:e.target.checked})}/> 公开书签</label>
        <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={form.is_favorite} onChange={e=>setForm({...form,is_favorite:e.target.checked})}/> 精选书签</label>
        <button className="button primary" disabled={saving}>{saving?"保存中…":"保存书签"}</button>
      </form>
      <div className="card" style={{gridColumn:"span 1"}}>
        <h3>现有书签 ({items.length})</h3>
        <div style={{display:"grid",gap:12}}>
          {items.map(x=><div key={x.id} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong style={{fontSize:13}}>{x.title}</strong><button onClick={()=>setConfirmTarget({kind:"bookmark",id:x.id,label:x.title})} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button></div>
            <div style={{fontSize:11,color:"#929dab",marginTop:5}}>{x.is_public?"公开":"私人"} · {x.category} · {x.url}</div>
          </div>)}
          {!items.length&&<p style={{color:"#929dab",fontSize:12}}>还没有书签。</p>}
        </div>
      </div>
    </div> : <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <h3>文章列表 ({articles.length})</h3>
          <button className="button primary" onClick={newArticle}>新建文章</button>
        </div>
        <div style={{display:"grid",gap:12,marginTop:12}}>
          {articlesLoading&&<p style={{color:"#929dab",fontSize:12}}>加载中…</p>}
          {articles.map(a=><div key={a.slug} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
              <strong style={{fontSize:13}}>{a.slug}</strong>
              <span style={{display:"flex",gap:10}}>
                <button onClick={()=>editArticle(a)} style={{background:"none",border:0,color:"#b5f36b",cursor:"pointer"}}>编辑</button>
                <button onClick={()=>setConfirmTarget({kind:"article",path:a.path,label:a.slug})} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button>
              </span>
            </div>
            <div style={{fontSize:11,color:"#929dab",marginTop:5}}>{a.name} · {(a.size/1024).toFixed(1)} KB</div>
          </div>)}
          {!articlesLoading&&!articles.length&&<p style={{color:"#929dab",fontSize:12}}>还没有文章，点击“新建文章”开始写。</p>}
        </div>
        <button className="button secondary" onClick={loadArticles} style={{marginTop:12}}>刷新列表</button>
      </div>
      <form className="card" onSubmit={saveArticle} style={{display:"grid",gap:12}}>
        <h3>{editingSlug ? `编辑文章：${editingSlug}` : "新建文章"}</h3>
        <input className={inputClass} required placeholder="文章标题" value={article.title} onChange={e=>setArticle({...article,title:e.target.value})}/>
        {editingSlug ? <div style={{fontSize:12,color:"#929dab"}}>slug：<code>{editingSlug}</code>（编辑时不可改 slug，改 slug 请删除后新建）</div>
        : <input className={inputClass} required placeholder="URL slug，例如 ai-tools-notes（仅字母、数字、-、_）" value={article.slug} onChange={e=>setArticle({...article,slug:e.target.value})}/>}
        <input className={inputClass} placeholder="文章简介" value={article.description} onChange={e=>setArticle({...article,description:e.target.value})}/>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <input className={inputClass} placeholder="分类" value={article.category} onChange={e=>setArticle({...article,category:e.target.value})}/>
          <input className={inputClass} placeholder="标签，逗号分隔" value={article.tags} onChange={e=>setArticle({...article,tags:e.target.value})}/>
          <input className={inputClass} type="date" value={article.pubDate} onChange={e=>setArticle({...article,pubDate:e.target.value})} title="发布日期"/>
        </div>
        <input className={inputClass} type="url" placeholder="封面图片 URL（可选）" value={article.cover} onChange={e=>setArticle({...article,cover:e.target.value})}/>
        <input className={inputClass} placeholder="SEO 标题（可选，默认用文章标题）" value={article.seoTitle} onChange={e=>setArticle({...article,seoTitle:e.target.value})}/>
        <input className={inputClass} placeholder="SEO 描述（可选，默认用文章简介）" value={article.seoDescription} onChange={e=>setArticle({...article,seoDescription:e.target.value})}/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={article.draft} onChange={e=>setArticle({...article,draft:e.target.checked})}/> 草稿（不公开显示）</label>
          <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={article.featured} onChange={e=>setArticle({...article,featured:e.target.checked})}/> 精选文章</label>
        </div>
        <textarea className={inputClass} rows={18} placeholder="使用 Markdown 编写正文…" value={article.body} onChange={e=>setArticle({...article,body:e.target.value})}/>
        <button className="button primary" disabled={saving}>{saving?"提交中…":(editingSlug?"保存修改":"提交到 GitHub 并发布")}</button>
        <p style={{color:"#929dab",fontSize:12}}>保存通过 Supabase Edge Function 调用 GitHub API，服务端会校验 frontmatter，非法内容会被拒绝。</p>
      </form>
    </div>}
    {confirmTarget&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50}} onClick={()=>setConfirmTarget(null)}>
      <div className="card" style={{maxWidth:420,width:"90%"}} onClick={e=>e.stopPropagation()}>
        <h3>确定删除？</h3>
        <p style={{color:"#aab3c0",fontSize:13}}>即将删除{confirmTarget.kind==="article"?"文章":"书签"}「{confirmTarget.label}」，此操作不可撤销。</p>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
          <button className="button secondary" onClick={()=>setConfirmTarget(null)}>取消</button>
          <button className="button primary" style={{background:"#f28b82",borderColor:"#f28b82",color:"#1a1d21"}} onClick={runConfirmedDelete}>确定删除</button>
        </div>
      </div>
    </div>}
    {message&&<div className="empty-state" style={{marginTop:18,color:msgKind==="err"?"#f28b82":"#b5f36b"}}>{message}</div>}
  </div>;
}
