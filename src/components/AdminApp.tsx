import React, { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

type Bookmark = {id:string;url:string;title:string;description:string|null;note:string|null;category:string|null;is_public:boolean;is_favorite:boolean;status:string;tags:string[]};
type BookmarkForm = {url:string;title:string;description:string;note:string;category:string;tags:string;is_public:boolean;is_favorite:boolean};
type ArticleFile = {name:string;slug:string;path:string;sha:string;size:number};
type ArticleForm = {slug:string;title:string;description:string;category:string;tags:string;cover:string;seoTitle:string;seoDescription:string;featured:boolean;draft:boolean;pubDate:string;body:string};
type TagRow = {id:string;name:string};
type CategoryRow = {id:string;name:string;slug:string};
type ConfirmTarget = {kind:"article"|"bookmark"|"bookmarkBatch"|"tag"|"category";label:string;path?:string;id?:string;ids?:string[];oldName?:string};
const emptyBookmarkForm = (): BookmarkForm => ({url:"",title:"",description:"",note:"",category:"AI & Tools",tags:"",is_public:true,is_favorite:false});
const normalizeUrl = (u: string) => u.trim().replace(/\/+$/,"");
const parseTagNames = (s: string) => Array.from(new Set(s.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean)));
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
  const [tab,setTab] = useState<"bookmarks"|"articles"|"data">("bookmarks");
  const [form,setForm] = useState<BookmarkForm>(emptyBookmarkForm());
  const [editingBookmarkId,setEditingBookmarkId] = useState<string|null>(null);
  const [selected,setSelected] = useState<string[]>([]);
  const [article,setArticle] = useState<ArticleForm>(emptyArticle());
  const [editingSlug,setEditingSlug] = useState<string|null>(null);
  const [articles,setArticles] = useState<ArticleFile[]>([]);
  const [articlesLoading,setArticlesLoading] = useState(false);
  const [confirmTarget,setConfirmTarget] = useState<ConfirmTarget|null>(null);
  const [saving,setSaving] = useState(false);
  const [tags,setTags] = useState<TagRow[]>([]);
  const [categories,setCategories] = useState<CategoryRow[]>([]);
  const [newCategoryName,setNewCategoryName] = useState("");
  const [editingTagId,setEditingTagId] = useState<string|null>(null);
  const [editingTagName,setEditingTagName] = useState("");
  const [editingCatId,setEditingCatId] = useState<string|null>(null);
  const [editingCatName,setEditingCatName] = useState("");

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
    const {data,error}=await supabase.from("bookmarks").select("id,url,title,description,note,category,is_public,is_favorite,status,bookmark_tags(tags(name))").order("created_at",{ascending:false});
    if(error) { say("err",error.message); return; }
    const mapped = ((data||[]) as any[]).map(x=>({
      id:x.id,url:x.url,title:x.title,description:x.description,note:x.note,category:x.category,
      is_public:x.is_public,is_favorite:x.is_favorite,status:x.status||"active",
      tags:((x.bookmark_tags||[]) as any[]).map(bt=>bt.tags?.name).filter(Boolean) as string[]
    })) as Bookmark[];
    setItems(mapped);
  }
  useEffect(()=>{if(session) loadBookmarks()},[session]);

  async function loadTags(){
    if(!supabase) return;
    const {data,error}=await supabase.from("tags").select("id,name").order("name");
    if(error) { say("err",error.message); return; }
    setTags((data||[]) as TagRow[]);
  }
  async function loadCategories(){
    if(!supabase) return;
    const {data,error}=await supabase.from("categories").select("id,name,slug").order("name");
    if(error) { say("err",error.message); return; }
    setCategories((data||[]) as CategoryRow[]);
  }
  useEffect(()=>{if(session){loadTags();loadCategories();}},[session]);
  useEffect(()=>{if(session && tab==="data"){loadTags();loadCategories();loadArticles();}},[session,tab]);

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
  async function syncBookmarkTags(bookmarkId: string, tagNames: string[]){
    if(!supabase) return;
    const ids: string[] = [];
    for (const name of tagNames) {
      const {data,error} = await supabase.from("tags").upsert({name},{onConflict:"name"}).select("id").single();
      if (error || !data) throw new Error(error?.message || `标签“${name}”保存失败`);
      ids.push((data as any).id as string);
    }
    const {error: delErr} = await supabase.from("bookmark_tags").delete().eq("bookmark_id",bookmarkId);
    if (delErr) throw new Error(delErr.message);
    if (ids.length) {
      const {error: insErr} = await supabase.from("bookmark_tags").insert(ids.map(tag_id=>({bookmark_id:bookmarkId,tag_id})));
      if (insErr) throw new Error(insErr.message);
    }
  }
  async function saveBookmark(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return;
    const url = normalizeUrl(form.url);
    if (!/^https?:\/\/.+/.test(url)) { say("err","URL 须以 http:// 或 https:// 开头。"); return; }
    const {data: dup, error: dupErr} = await supabase.from("bookmarks").select("id").eq("url",url);
    if (dupErr) { say("err",dupErr.message); return; }
    if ((dup||[]).some((d:any)=>d.id!==editingBookmarkId)) { say("err","该 URL 已存在，请勿重复添加。"); return; }
    setSaving(true);say("ok","");
    const payload={url,title:form.title.trim()||url,description:form.description||null,note:form.note||null,category:form.category,is_public:form.is_public,is_favorite:form.is_favorite};
    let bookmarkId = editingBookmarkId;
    let error: any = null;
    if (bookmarkId) {
      ({error} = await supabase.from("bookmarks").update(payload).eq("id",bookmarkId));
    } else {
      const res = await supabase.from("bookmarks").insert(payload).select("id").single();
      error = res.error;
      if (!error) bookmarkId = (res.data as any).id as string;
    }
    if (error) { setSaving(false); say("err",error.message); return; }
    try {
      await syncBookmarkTags(bookmarkId!, parseTagNames(form.tags));
    } catch (err:any) {
      setSaving(false); say("err",`书签已保存，但标签同步失败：${err.message}`); loadBookmarks(); return;
    }
    setSaving(false);
    say("ok", editingBookmarkId ? "书签已更新。" : "书签已保存。");
    setForm(emptyBookmarkForm()); setEditingBookmarkId(null); loadBookmarks();
  }
  function editBookmark(b: Bookmark){
    setForm({url:b.url,title:b.title,description:b.description||"",note:b.note||"",category:b.category||"AI & Tools",tags:b.tags.join(", "),is_public:b.is_public,is_favorite:b.is_favorite});
    setEditingBookmarkId(b.id);
    say("ok",`正在编辑书签：${b.title}`);
  }
  function cancelBookmarkEdit(){
    setForm(emptyBookmarkForm()); setEditingBookmarkId(null);
  }
  async function deleteBookmark(id:string){
    if(!supabase)return;
    const {error}=await supabase.from("bookmarks").delete().eq("id",id);
    if(error)say("err",error.message);else{say("ok","书签已删除。");setSelected(s=>s.filter(x=>x!==id));loadBookmarks()}
  }
  async function setBookmarkStatus(id:string, status:"active"|"archived"){
    if(!supabase)return;
    const {error}=await supabase.from("bookmarks").update({status}).eq("id",id);
    if(error)say("err",error.message);else{say("ok",status==="archived"?"书签已归档。":"书签已恢复。");loadBookmarks()}
  }
  async function batchDeleteBookmarks(ids:string[]){
    if(!supabase)return;
    const {error}=await supabase.from("bookmarks").delete().in("id",ids);
    if(error)say("err",error.message);else{say("ok",`已删除 ${ids.length} 条书签。`);setSelected([]);loadBookmarks()}
  }
  async function batchSetStatus(ids:string[], status:"active"|"archived"){
    if(!supabase)return;
    const {error}=await supabase.from("bookmarks").update({status}).in("id",ids);
    if(error)say("err",error.message);else{say("ok",status==="archived"?`已归档 ${ids.length} 条书签。`:`已恢复 ${ids.length} 条书签。`);setSelected([]);loadBookmarks()}
  }
  function tagUsage(name:string){ return items.filter(b=>b.tags.includes(name)).length; }
  function categoryUsage(name:string){ return items.filter(b=>b.category===name).length; }
  async function renameTag(id:string, newName:string){
    if(!supabase)return;
    const name = newName.trim().toLowerCase();
    if (!name) { say("err","标签名不能为空。"); return; }
    if (tags.some(t=>t.id!==id && t.name===name)) { say("err",`标签“${name}”已存在。`); return; }
    const {error}=await supabase.from("tags").update({name}).eq("id",id);
    if(error){ say("err",error.message); return; }
    say("ok",`标签已重命名为“${name}”。`);
    setEditingTagId(null); loadTags(); loadBookmarks();
  }
  async function deleteTag(id:string, name:string){
    if(!supabase)return;
    const {error}=await supabase.from("tags").delete().eq("id",id);
    if(error){ say("err",error.message); return; }
    say("ok",`标签“${name}”已删除（${tagUsage(name)} 条书签的该标签已移除）。`);
    loadTags(); loadBookmarks();
  }
  function makeSlug(name:string){
    return name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g,"-").replace(/^-+|-+$/g,"") || "category";
  }
  async function addCategory(){
    if(!supabase)return;
    const name = newCategoryName.trim();
    if (!name) { say("err","分类名不能为空。"); return; }
    if (categories.some(c=>c.name===name)) { say("err",`分类“${name}”已存在。`); return; }
    const slug = makeSlug(name);
    if (categories.some(c=>c.slug===slug)) { say("err",`分类 slug “${slug}” 已存在，请换一个名字。`); return; }
    const {error}=await supabase.from("categories").insert({name,slug});
    if(error){ say("err",error.message); return; }
    say("ok",`分类“${name}”已添加。`);
    setNewCategoryName(""); loadCategories();
  }
  async function renameCategory(id:string, oldName:string, newName:string){
    if(!supabase)return;
    const name = newName.trim();
    if (!name) { say("err","分类名不能为空。"); return; }
    if (name === oldName) { setEditingCatId(null); return; }
    if (categories.some(c=>c.id!==id && c.name===name)) { say("err",`分类“${name}”已存在。`); return; }
    const slug = makeSlug(name);
    if (categories.some(c=>c.id!==id && c.slug===slug)) { say("err",`分类 slug “${slug}” 已存在，请换一个名字。`); return; }
    const {error: bErr} = await supabase.from("bookmarks").update({category:name}).eq("category",oldName);
    if (bErr) { say("err",`书签分类更新失败：${bErr.message}`); return; }
    const {error} = await supabase.from("categories").update({name,slug}).eq("id",id);
    if (error) { say("err",error.message); return; }
    say("ok",`分类已重命名为“${name}”（${categoryUsage(oldName)} 条书签已同步）。`);
    setEditingCatId(null); loadCategories(); loadBookmarks();
  }
  async function deleteCategory(id:string, name:string){
    if(!supabase)return;
    const used = categoryUsage(name);
    const {error: bErr} = await supabase.from("bookmarks").update({category:null}).eq("category",name);
    if (bErr) { say("err",`书签分类清空失败：${bErr.message}`); return; }
    const {error} = await supabase.from("categories").delete().eq("id",id);
    if (error) { say("err",error.message); return; }
    say("ok",`分类“${name}”已删除${used ? `（${used} 条书签已设为未分类）` : ""}。`);
    loadCategories(); loadBookmarks();
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
    if (t.kind === "bookmarkBatch" && t.ids?.length) await batchDeleteBookmarks(t.ids);
    if (t.kind === "tag" && t.id) await deleteTag(t.id, t.label);
    if (t.kind === "category" && t.id) await deleteCategory(t.id, t.label);
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

  const statPublic = items.filter(b=>b.is_public && b.status==="active").length;
  const statPrivate = items.filter(b=>!b.is_public).length;
  const statArchived = items.filter(b=>b.status==="archived").length;
  const statFav = items.filter(b=>b.is_favorite).length;
  const topCategories = [...categories].map(c=>({name:c.name,count:categoryUsage(c.name)})).sort((a,b)=>b.count-a.count).slice(0,5);
  const topTags = [...tags].map(t=>({name:t.name,count:tagUsage(t.name)})).sort((a,b)=>b.count-a.count).slice(0,10);

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:20}}>
      <div style={{display:"flex",gap:8}}>
        <button className={`button ${tab==="bookmarks"?"primary":"secondary"}`} onClick={()=>setTab("bookmarks")}>书签管理</button>
        <button className={`button ${tab==="articles"?"primary":"secondary"}`} onClick={()=>setTab("articles")}>文章管理</button>
        <button className={`button ${tab==="data"?"primary":"secondary"}`} onClick={()=>setTab("data")}>数据管理</button>
      </div>
      <button className="button secondary" onClick={logout}>退出登录</button>
    </div>
    {tab==="bookmarks" ? <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
      <form className="card" onSubmit={saveBookmark} style={{display:"grid",gap:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h3>{editingBookmarkId ? "编辑书签" : "添加书签"}</h3>
          {editingBookmarkId&&<button type="button" onClick={cancelBookmarkEdit} style={{background:"none",border:0,color:"#929dab",cursor:"pointer",fontSize:12}}>取消编辑</button>}
        </div>
        <input className={inputClass} type="url" required placeholder="https://example.com" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/>
        <input className={inputClass} placeholder="标题（可选）" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
        <input className={inputClass} placeholder="描述" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
        <textarea className={inputClass} placeholder="个人备注" rows={3} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/>
        <input className={inputClass} placeholder="标签，逗号分隔" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/>
        <select className={inputClass} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
          {(categories.length ? categories.map(c=>c.name) : ["AI & Tools","Development","Networking","Design","Productivity","Resources","Interesting"]).map(x=><option key={x}>{x}</option>)}
        </select>
        <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={form.is_public} onChange={e=>setForm({...form,is_public:e.target.checked})}/> 公开书签</label>
        <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={form.is_favorite} onChange={e=>setForm({...form,is_favorite:e.target.checked})}/> 精选书签</label>
        <button className="button primary" disabled={saving}>{saving?"保存中…":(editingBookmarkId?"保存修改":"保存书签")}</button>
        <p style={{color:"#929dab",fontSize:12}}>同一 URL 只能保存一次；归档的书签不会在公开页面显示。</p>
      </form>
      <div className="card" style={{gridColumn:"span 1"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <h3>现有书签 ({items.length})</h3>
          <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={items.length>0&&selected.length===items.length} onChange={e=>setSelected(e.target.checked?items.map(x=>x.id):[])}/> 全选</label>
        </div>
        {selected.length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
          <button className="button secondary" onClick={()=>batchSetStatus(selected,"archived")}>批量归档 ({selected.length})</button>
          <button className="button secondary" onClick={()=>batchSetStatus(selected,"active")}>批量恢复 ({selected.length})</button>
          <button className="button primary" style={{background:"#f28b82",borderColor:"#f28b82",color:"#1a1d21"}} onClick={()=>setConfirmTarget({kind:"bookmarkBatch",ids:selected,label:`${selected.length} 条书签`})}>批量删除 ({selected.length})</button>
        </div>}
        <div style={{display:"grid",gap:12,marginTop:12}}>
          {items.map(x=><div key={x.id} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start"}}>
              <span style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <input type="checkbox" checked={selected.includes(x.id)} onChange={e=>setSelected(e.target.checked?[...selected,x.id]:selected.filter(id=>id!==x.id))} style={{marginTop:3}}/>
                <span>
                  <strong style={{fontSize:13}}>{x.title}</strong>
                  {x.status==="archived"&&<span style={{fontSize:11,color:"#f2c94c",marginLeft:6}}>已归档</span>}
                  {x.is_favorite&&<span style={{fontSize:11,color:"#b5f36b",marginLeft:6}}>精选</span>}
                  <div style={{fontSize:11,color:"#929dab",marginTop:5}}>{x.is_public?"公开":"私人"} · {x.category} · {x.url}</div>
                  {x.tags.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>{x.tags.map(t=><span className="tag" key={t}>{t}</span>)}</div>}
                </span>
              </span>
              <span style={{display:"flex",gap:10,whiteSpace:"nowrap"}}>
                <button onClick={()=>editBookmark(x)} style={{background:"none",border:0,color:"#b5f36b",cursor:"pointer"}}>编辑</button>
                <button onClick={()=>setBookmarkStatus(x.id,x.status==="archived"?"active":"archived")} style={{background:"none",border:0,color:"#f2c94c",cursor:"pointer"}}>{x.status==="archived"?"恢复":"归档"}</button>
                <button onClick={()=>setConfirmTarget({kind:"bookmark",id:x.id,label:x.title})} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button>
              </span>
            </div>
          </div>)}
          {!items.length&&<p style={{color:"#929dab",fontSize:12}}>还没有书签。</p>}
        </div>
      </div>
    </div> : tab==="articles" ? <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
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
    </div> : <div style={{display:"grid",gap:16}}>
      <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))"}}>
        {[
          {label:"书签总数",value:items.length},
          {label:"公开书签",value:statPublic},
          {label:"私人书签",value:statPrivate},
          {label:"已归档",value:statArchived},
          {label:"精选",value:statFav},
          {label:"文章",value:articles.length},
          {label:"分类",value:categories.length},
          {label:"标签",value:tags.length},
        ].map(s=><div key={s.label} className="card" style={{textAlign:"center",padding:"18px 10px"}}>
          <div style={{fontSize:26,fontWeight:700,color:"#b5f36b"}}>{s.value}</div>
          <div style={{fontSize:11,color:"#929dab",marginTop:6}}>{s.label}</div>
        </div>)}
      </div>
      <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
        <div className="card">
          <h3>标签管理 ({tags.length})</h3>
          <p style={{color:"#929dab",fontSize:12}}>重命名会同步到所有使用该标签的书签；删除标签会移除它在所有书签上的关联。</p>
          <div style={{display:"grid",gap:10,marginTop:12}}>
            {tags.map(t=><div key={t.id} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
              {editingTagId===t.id ? <div style={{display:"flex",gap:8}}>
                <input className={inputClass} value={editingTagName} onChange={e=>setEditingTagName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();renameTag(t.id,editingTagName);}}} style={{flex:1}}/>
                <button className="button primary" onClick={()=>renameTag(t.id,editingTagName)}>保存</button>
                <button className="button secondary" onClick={()=>setEditingTagId(null)}>取消</button>
              </div> : <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                <span><strong style={{fontSize:13}}>{t.name}</strong><span style={{fontSize:11,color:"#929dab",marginLeft:8}}>用在 {tagUsage(t.name)} 条书签</span></span>
                <span style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setEditingTagId(t.id);setEditingTagName(t.name);}} style={{background:"none",border:0,color:"#b5f36b",cursor:"pointer"}}>重命名</button>
                  <button onClick={()=>setConfirmTarget({kind:"tag",id:t.id,label:t.name})} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button>
                </span>
              </div>}
            </div>)}
            {!tags.length&&<p style={{color:"#929dab",fontSize:12}}>还没有标签，添加书签时填写标签即可创建。</p>}
          </div>
        </div>
        <div className="card">
          <h3>分类管理 ({categories.length})</h3>
          <p style={{color:"#929dab",fontSize:12}}>重命名会同步更新使用该分类的书签；删除分类会把相关书签设为未分类。</p>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <input className={inputClass} placeholder="新分类名，例如 学习" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addCategory();}}} style={{flex:1}}/>
            <button className="button primary" onClick={addCategory}>添加分类</button>
          </div>
          <div style={{display:"grid",gap:10,marginTop:12}}>
            {categories.map(c=><div key={c.id} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
              {editingCatId===c.id ? <div style={{display:"flex",gap:8}}>
                <input className={inputClass} value={editingCatName} onChange={e=>setEditingCatName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();renameCategory(c.id,c.name,editingCatName);}}} style={{flex:1}}/>
                <button className="button primary" onClick={()=>renameCategory(c.id,c.name,editingCatName)}>保存</button>
                <button className="button secondary" onClick={()=>setEditingCatId(null)}>取消</button>
              </div> : <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                <span><strong style={{fontSize:13}}>{c.name}</strong><span style={{fontSize:11,color:"#929dab",marginLeft:8}}>用在 {categoryUsage(c.name)} 条书签 · slug {c.slug}</span></span>
                <span style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setEditingCatId(c.id);setEditingCatName(c.name);}} style={{background:"none",border:0,color:"#b5f36b",cursor:"pointer"}}>重命名</button>
                  <button onClick={()=>setConfirmTarget({kind:"category",id:c.id,label:c.name})} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button>
                </span>
              </div>}
            </div>)}
            {!categories.length&&<p style={{color:"#929dab",fontSize:12}}>还没有分类。</p>}
          </div>
        </div>
      </div>
      <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
        <div className="card">
          <h3>热门分类</h3>
          <div style={{display:"grid",gap:8,marginTop:12}}>
            {topCategories.map(c=><div key={c.name} style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span>{c.name}</span><span style={{color:"#b5f36b"}}>{c.count}</span></div>)}
            {!topCategories.length&&<p style={{color:"#929dab",fontSize:12}}>暂无数据。</p>}
          </div>
        </div>
        <div className="card">
          <h3>热门标签</h3>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:12}}>
            {topTags.map(t=><span key={t.name} className="tag">{t.name} · {t.count}</span>)}
            {!topTags.length&&<p style={{color:"#929dab",fontSize:12}}>暂无数据。</p>}
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button className="button secondary" onClick={()=>{loadBookmarks();loadTags();loadCategories();loadArticles();}}>刷新全部数据</button>
      </div>
    </div>}
    {confirmTarget&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50}} onClick={()=>setConfirmTarget(null)}>
      <div className="card" style={{maxWidth:420,width:"90%"}} onClick={e=>e.stopPropagation()}>
        <h3>确定删除？</h3>
        <p style={{color:"#aab3c0",fontSize:13}}>即将删除{confirmTarget.kind==="article"?"文章":confirmTarget.kind==="tag"?"标签":confirmTarget.kind==="category"?"分类":"书签"}「{confirmTarget.label}」{confirmTarget.kind==="category"?"，相关书签将设为未分类":""}{confirmTarget.kind==="tag"?"，该标签将从所有书签上移除":""}，此操作不可撤销。</p>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
          <button className="button secondary" onClick={()=>setConfirmTarget(null)}>取消</button>
          <button className="button primary" style={{background:"#f28b82",borderColor:"#f28b82",color:"#1a1d21"}} onClick={runConfirmedDelete}>确定删除</button>
        </div>
      </div>
    </div>}
    {message&&<div className="empty-state" style={{marginTop:18,color:msgKind==="err"?"#f28b82":"#b5f36b"}}>{message}</div>}
  </div>;
}
