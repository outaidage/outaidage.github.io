import React, { useEffect, useRef, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import VideoSceneAdmin from "@/components/VideoSceneAdmin";
import ArticleVersionHistory, { type ArticleVersion } from "@/components/ArticleVersionHistory";
import ArticlePreview from "@/components/ArticlePreview";
import HomeModuleAdmin from "@/components/HomeModuleAdmin";
import NavAdmin from "@/components/NavAdmin";
import BackgroundStudio from "@/components/BackgroundStudio";
import UniverseAdmin from "@/components/UniverseAdmin";
import HeroAdmin from "@/components/HeroAdmin";
import ProjectsAdmin from "@/components/ProjectsAdmin";
import ChangelogAdmin from "@/components/ChangelogAdmin";
import PageContentAdmin from "@/components/PageContentAdmin";
import ToolboxAdmin from "@/components/ToolboxAdmin";

type Bookmark = {id:string;url:string;title:string;description:string|null;note:string|null;category:string|null;is_public:boolean;is_favorite:boolean;status:string;tags:string[]};
type BookmarkForm = {url:string;title:string;description:string;note:string;category:string;tags:string;is_public:boolean;is_favorite:boolean};
type ArticleFile = {name:string;slug:string;path:string;sha:string;size:number};
type ArticleForm = {slug:string;title:string;description:string;category:string;tags:string;cover:string;seoTitle:string;seoDescription:string;featured:boolean;draft:boolean;pubDate:string;body:string};
type TagRow = {id:string;name:string};
type CategoryRow = {id:string;name:string;slug:string};
type RecLink = {id:string;title:string;url:string;description:string|null;category:string|null;sort_order:number};
type RecLinkForm = {title:string;url:string;description:string;category:string;sort_order:string};
type GuestbookEntry = {id:string;name:string;message:string;created_at:string;approved:boolean;pinned?:boolean};
type ArticleComment = {id:string;article_slug:string;name:string;message:string;created_at:string;approved:boolean};
type AuditEntry = {id:string;admin_email:string|null;action:string;target_type:string|null;target_label:string|null;detail:string|null;created_at:string};
const emptyRecLinkForm = (): RecLinkForm => ({title:"",url:"",description:"",category:"",sort_order:"0"});
type ConfirmTarget = {kind:"article"|"bookmark"|"bookmarkBatch"|"tag"|"category"|"reclink"|"guestbook"|"comment";label:string;path?:string;id?:string;ids?:string[];oldName?:string};
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
  const [tab,setTab] = useState<"bookmarks"|"articles"|"data"|"links"|"guestbook"|"media"|"modules"|"nav"|"background"|"universe"|"hero"|"projects"|"changelog"|"pages"|"toolbox">("bookmarks");
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
  const [recLinks,setRecLinks] = useState<RecLink[]>([]);
  const [recForm,setRecForm] = useState<RecLinkForm>(emptyRecLinkForm());
  const [editingRecId,setEditingRecId] = useState<string|null>(null);
  const [gbEntries,setGbEntries] = useState<GuestbookEntry[]>([]);
  const [comments,setComments] = useState<ArticleComment[]>([]);
  const [auditLog,setAuditLog] = useState<AuditEntry[]>([]);
  const [versionTick,setVersionTick] = useState(0);
  const [previewMode,setPreviewMode] = useState<"edit"|"preview">("edit");
  const fileRef = useRef<HTMLInputElement|null>(null);
  const coverFileRef = useRef<HTMLInputElement|null>(null);
  const raindropFileRef = useRef<HTMLInputElement|null>(null);

  const say = (kind:"ok"|"err", text:string) => { setMsgKind(kind); setMessage(text); };

  async function logAudit(action:string, targetType:string|null, targetLabel:string|null, detail?:string){
    if(!supabase) return;
    const email = (session as any)?.user?.email as string | undefined;
    await supabase.from("admin_audit_log").insert({
      admin_email: email || null,
      action, target_type: targetType, target_label: targetLabel,
      detail: detail || null,
    });
  }
  async function loadAuditLog(){
    if(!supabase) return;
    const {data,error}=await supabase.from("admin_audit_log").select("id,admin_email,action,target_type,target_label,detail,created_at").order("created_at",{ascending:false}).limit(50);
    if(error) { say("err",error.message); return; }
    setAuditLog((data||[]) as AuditEntry[]);
  }

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
  // Bookmarklet prefill: /admin/?url=...&title=... fills the new-bookmark form.
  useEffect(()=>{
    if(!session) return;
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    if (!url) return;
    const title = params.get("title") || "";
    setTab("bookmarks");
    setForm(f=>({...f, url, title: title || f.title}));
    say("ok","已从 Bookmarklet 填入链接和标题，确认后点保存。");
  },[session]);

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
  async function loadRecLinks(){
    if(!supabase) return;
    const {data,error}=await supabase.from("recommended_links").select("id,title,url,description,category,sort_order").order("sort_order",{ascending:true}).order("created_at",{ascending:false});
    if(error) { say("err",error.message); return; }
    setRecLinks((data||[]) as RecLink[]);
  }
  async function saveRecLink(e: React.FormEvent){
    e.preventDefault();
    if(!supabase) return;
    const url = normalizeUrl(recForm.url);
    if(!/^https?:\/\/.+/.test(url)){ say("err","请填写以 http:// 或 https:// 开头的链接。"); return; }
    if(!recForm.title.trim()){ say("err","请填写标题。"); return; }
    setSaving(true);
    const payload = {
      title: recForm.title.trim(),
      url,
      description: recForm.description.trim() || null,
      category: recForm.category.trim() || null,
      sort_order: parseInt(recForm.sort_order,10) || 0,
    };
    let error = null;
    if (editingRecId) {
      ({error} = await supabase.from("recommended_links").update(payload).eq("id",editingRecId));
    } else {
      const {error: dupErr} = await supabase.from("recommended_links").select("id").eq("url",url);
      if (!dupErr) {
        const {data: dup} = await supabase.from("recommended_links").select("id").eq("url",url);
        if (dup && dup.length) { say("err","这个链接已经在推荐列表里了。"); setSaving(false); return; }
      }
      ({error} = await supabase.from("recommended_links").insert(payload));
    }
    setSaving(false);
    if (error) { say("err",`推荐链接保存失败：${error.message}`); return; }
    say("ok", editingRecId ? "推荐链接已更新。" : "推荐链接已添加。");
    setRecForm(emptyRecLinkForm()); setEditingRecId(null); loadRecLinks();
  }
  function editRecLink(l: RecLink){
    setEditingRecId(l.id);
    setRecForm({title:l.title, url:l.url, description:l.description||"", category:l.category||"", sort_order:String(l.sort_order)});
  }
  async function deleteRecLink(id: string){
    if(!supabase) return;
    const {error} = await supabase.from("recommended_links").delete().eq("id",id);
    if (error) { say("err",`删除失败：${error.message}`); return; }
    say("ok","推荐链接已删除。");
    await logAudit("reclink_delete","recommended_link",id);
    loadRecLinks();
  }
  async function loadGbEntries(){
    if(!supabase) return;
    const {data,error}=await supabase.from("guestbook_entries").select("id,name,message,created_at,approved,pinned").order("approved",{ascending:true}).order("pinned",{ascending:false}).order("created_at",{ascending:false});
    if(error) { say("err",error.message); return; }
    setGbEntries((data||[]) as GuestbookEntry[]);
  }
  async function setGbApproved(id: string, approved: boolean){
    if(!supabase) return;
    const {error} = await supabase.from("guestbook_entries").update({approved}).eq("id",id);
    if (error) { say("err",`操作失败：${error.message}`); return; }
    say("ok", approved ? "留言已通过审核，将公开显示。" : "留言已撤回，不再公开显示。");
    await logAudit(approved ? "guestbook_approve" : "guestbook_withdraw","guestbook",id);
    loadGbEntries();
  }
  async function setGbPinned(id: string, pinned: boolean){
    if(!supabase) return;
    const {error} = await supabase.from("guestbook_entries").update({pinned}).eq("id",id);
    if (error) { say("err",`操作失败：${error.message}`); return; }
    say("ok", pinned ? "留言已置顶。" : "留言已取消置顶。");
    loadGbEntries();
  }
  async function deleteGbEntry(id: string){
    if(!supabase) return;
    const {error} = await supabase.from("guestbook_entries").delete().eq("id",id);
    if (error) { say("err",`删除失败：${error.message}`); return; }
    say("ok","留言已删除。");
    await logAudit("guestbook_delete","guestbook",id);
    loadGbEntries();
  }
  async function loadComments(){
    if(!supabase) return;
    const {data,error}=await supabase.from("comments").select("id,article_slug,name,message,created_at,approved").order("approved",{ascending:true}).order("created_at",{ascending:false});
    if(error) { say("err",error.message); return; }
    setComments((data||[]) as ArticleComment[]);
  }
  async function setCommentApproved(id: string, approved: boolean){
    if(!supabase) return;
    const {error} = await supabase.from("comments").update({approved}).eq("id",id);
    if (error) { say("err",`操作失败：${error.message}`); return; }
    say("ok", approved ? "评论已通过审核，将公开显示。" : "评论已撤回，不再公开显示。");
    await logAudit(approved ? "comment_approve" : "comment_withdraw","comment",id);
    loadComments();
  }
  async function deleteComment(id: string){
    if(!supabase) return;
    const {error} = await supabase.from("comments").delete().eq("id",id);
    if (error) { say("err",`删除失败：${error.message}`); return; }
    say("ok","评论已删除。");
    await logAudit("comment_delete","comment",id);
    loadComments();
  }
  useEffect(()=>{if(session){loadTags();loadCategories();}},[session]);
  useEffect(()=>{if(session && tab==="data"){loadTags();loadCategories();loadArticles();loadAuditLog();}},[session,tab]);
  useEffect(()=>{if(session && tab==="links") loadRecLinks()},[session,tab]);
  useEffect(()=>{if(session && tab==="guestbook"){loadGbEntries();loadComments();}},[session,tab]);

  // 文章列表来自 GitHub（经 Edge Function），提交后 GitHub 的列表接口
  // 可能短暂返回旧数据（最终一致性）——这正是“保存成功但列表没变、
  // 要手动刷新”的根源。30 秒内刚保存/删除的文章以本地记录为准合并，
  // 窗口过后完全以服务器列表为准。
  const recentArticleSaves = useRef<Map<string, { file: ArticleFile; at: number }>>(new Map());
  const recentArticleDeletes = useRef<Map<string, number>>(new Map());
  async function loadArticles(){
    setArticlesLoading(true);
    const {data,error} = await callFunction({action:"list"});
    setArticlesLoading(false);
    if (error) { say("err",`文章列表加载失败：${error.message}`); return; }
    const files = (data as any)?.files as ArticleFile[] | undefined;
    if (!Array.isArray(files)) { say("err","文章列表返回异常，请检查 Edge Function。"); return; }
    const now = Date.now();
    const merged = files.filter(f => {
      const delAt = recentArticleDeletes.current.get(f.path);
      return !(delAt && now - delAt < 30000);
    });
    recentArticleSaves.current.forEach(({file, at}, slug) => {
      if (now - at < 30000 && !merged.some(f => f.slug === slug)) merged.unshift(file);
    });
    setArticles(merged);
  }
  useEffect(()=>{if(session && tab==="articles") loadArticles()},[session,tab]);

  async function login(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return;
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if (error) say("err",error.message); else { say("ok","登录成功。"); await logAudit("login","session",email); }
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
    await logAudit(editingBookmarkId ? "bookmark_update" : "bookmark_create","bookmark",payload.title,payload.url);
    setForm(emptyBookmarkForm()); setEditingBookmarkId(null); await cleanupOrphanTags(); loadBookmarks(); loadTags();
  }
  function editBookmark(b: Bookmark){
    setForm({url:b.url,title:b.title,description:b.description||"",note:b.note||"",category:b.category||"AI & Tools",tags:b.tags.join(", "),is_public:b.is_public,is_favorite:b.is_favorite});
    setEditingBookmarkId(b.id);
    say("ok",`正在编辑书签：${b.title}`);
  }
  function cancelBookmarkEdit(){
    setForm(emptyBookmarkForm()); setEditingBookmarkId(null);
  }
  async function cleanupOrphanTags(){
    if(!supabase) return;
    const {data: used} = await supabase.from("bookmark_tags").select("tag_id");
    const usedIds = new Set(((used||[]) as any[]).map(x=>x.tag_id));
    const {data: all} = await supabase.from("tags").select("id");
    const orphans = ((all||[]) as any[]).map(x=>x.id).filter(id=>!usedIds.has(id));
    if (orphans.length) await supabase.from("tags").delete().in("id", orphans);
  }
  async function exportBackup(){
    if(!supabase) return;
    say("ok","正在生成备份…");
    const articleContents: {slug:string;content:string}[] = [];
    for (const a of articles) {
      const {data,error} = await callFunction({action:"get", path:a.path});
      if (error) { say("err",`备份失败：文章 ${a.slug} 读取失败：${error.message}`); return; }
      const content = (data as any)?.content as string;
      if (typeof content !== "string") { say("err",`备份失败：文章 ${a.slug} 内容异常。`); return; }
      articleContents.push({slug:a.slug, content});
    }
    const {data: recLinksData} = await supabase.from("recommended_links").select("id,title,url,description,category,sort_order,created_at").order("sort_order",{ascending:true});
    const {data: gbData} = await supabase.from("guestbook_entries").select("id,name,message,created_at,approved").order("created_at",{ascending:true});
    const {data: commentsData} = await supabase.from("comments").select("id,article_slug,name,message,created_at,approved").order("created_at",{ascending:true});
    const {data: storageFiles} = await supabase.storage.from("article-images").list("covers",{limit:1000});
    const backup = {
      version: 2,
      app: "OUTAI",
      exportedAt: new Date().toISOString(),
      categories: categories.map(c=>({name:c.name, slug:c.slug})),
      tags: tags.map(t=>({name:t.name})),
      bookmarks: items.map(b=>({
        url:b.url, title:b.title, description:b.description, note:b.note,
        category:b.category, is_public:b.is_public, is_favorite:b.is_favorite,
        status:b.status, tags:b.tags,
      })),
      articles: articleContents,
      recommendedLinks: (recLinksData||[]).map((r:any)=>({title:r.title, url:r.url, description:r.description, category:r.category, sort_order:r.sort_order})),
      guestbookEntries: (gbData||[]).map((g:any)=>({id:g.id, name:g.name, message:g.message, created_at:g.created_at, approved:g.approved})),
      comments: (commentsData||[]).map((c:any)=>({id:c.id, article_slug:c.article_slug, name:c.name, message:c.message, created_at:c.created_at, approved:c.approved})),
      storageInventory: (storageFiles||[]).map((f:any)=>({path:`covers/${f.name}`, name:f.name, size:f.metadata?.size ?? null, updated_at:f.updated_at ?? null})),
    };
    const blob = new Blob([JSON.stringify(backup,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outai-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    await logAudit("backup_export","backup",`outai-backup-${new Date().toISOString().slice(0,10)}.json`,`${items.length} 条书签、${categories.length} 个分类、${tags.length} 个标签、${articleContents.length} 篇文章、${(recLinksData||[]).length} 条推荐链接、${(gbData||[]).length} 条留言、${(commentsData||[]).length} 条评论`);
    say("ok",`备份已导出：${items.length} 条书签、${categories.length} 个分类、${tags.length} 个标签、${articleContents.length} 篇文章、${(recLinksData||[]).length} 条推荐链接、${(gbData||[]).length} 条留言、${(commentsData||[]).length} 条评论。`);
  }
  async function importBackup(file: File){
    if(!supabase) return;
    let parsed: any;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      say("err","备份文件不是有效的 JSON。");
      return;
    }
    if (parsed?.app !== "OUTAI" || (parsed?.version !== 1 && parsed?.version !== 2) || !Array.isArray(parsed.bookmarks)) {
      say("err","这不是有效的 OUTAI 备份文件。");
      return;
    }
    setSaving(true); say("ok","正在导入备份…");
    let catCount = 0, tagCount = 0, bmCount = 0, artCount = 0, recCount = 0, gbCount = 0, cmCount = 0;
    try {
      for (const c of (parsed.categories||[])) {
        if (typeof c?.name !== "string" || typeof c?.slug !== "string") continue;
        const {error} = await supabase.from("categories").upsert({name:c.name, slug:c.slug}, {onConflict:"slug"});
        if (error) throw new Error(`分类“${c.name}”导入失败：${error.message}`);
        catCount++;
      }
      for (const t of (parsed.tags||[])) {
        if (typeof t?.name !== "string") continue;
        const {error} = await supabase.from("tags").upsert({name:t.name}, {onConflict:"name"});
        if (error) throw new Error(`标签“${t.name}”导入失败：${error.message}`);
        tagCount++;
      }
      for (const b of parsed.bookmarks) {
        if (typeof b?.url !== "string" || !/^https?:\/\/.+/.test(b.url)) continue;
        const url = normalizeUrl(b.url);
        const payload = {
          url,
          title: typeof b.title === "string" && b.title.trim() ? b.title.trim() : url,
          description: typeof b.description === "string" ? b.description : null,
          note: typeof b.note === "string" ? b.note : null,
          category: typeof b.category === "string" ? b.category : null,
          is_public: b.is_public !== false,
          is_favorite: b.is_favorite === true,
          status: b.status === "archived" ? "archived" : "active",
        };
        const res = await supabase.from("bookmarks").upsert(payload, {onConflict:"url"}).select("id").single();
        if (res.error) throw new Error(`书签 ${url} 导入失败：${res.error.message}`);
        const bookmarkId = (res.data as any).id as string;
        const tagNames = parseTagNames(Array.isArray(b.tags) ? b.tags.join(",") : "");
        await syncBookmarkTags(bookmarkId, tagNames);
        bmCount++;
      }
      for (const a of (parsed.articles||[])) {
        if (typeof a?.slug !== "string" || typeof a?.content !== "string") continue;
        if (!SLUG_RE.test(a.slug)) continue;
        const path = `src/content/blog/${a.slug}.md`;
        const {error} = await callFunction({action:"upsert", path, content:a.content});
        if (error) throw new Error(`文章 ${a.slug} 导入失败：${error.message}`);
        artCount++;
      }
      if (parsed.version === 2) {
        for (const r of (parsed.recommendedLinks||[])) {
          if (typeof r?.url !== "string" || typeof r?.title !== "string") continue;
          const {error} = await supabase.from("recommended_links").upsert({
            title:r.title, url:normalizeUrl(r.url),
            description: typeof r.description === "string" ? r.description : null,
            category: typeof r.category === "string" ? r.category : null,
            sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
          }, {onConflict:"url"});
          if (error) throw new Error(`推荐链接“${r.title}”导入失败：${error.message}`);
          recCount++;
        }
        for (const g of (parsed.guestbookEntries||[])) {
          if (typeof g?.name !== "string" || typeof g?.message !== "string") continue;
          const {error} = await supabase.from("guestbook_entries").upsert({
            id: typeof g.id === "string" ? g.id : undefined,
            name:g.name, message:g.message,
            created_at: typeof g.created_at === "string" ? g.created_at : undefined,
            approved: g.approved === true,
          }, {onConflict:"id"});
          if (error) throw new Error(`留言“${g.name}”导入失败：${error.message}`);
          gbCount++;
        }
        for (const c of (parsed.comments||[])) {
          if (typeof c?.article_slug !== "string" || typeof c?.name !== "string" || typeof c?.message !== "string") continue;
          const {error} = await supabase.from("comments").upsert({
            id: typeof c.id === "string" ? c.id : undefined,
            article_slug:c.article_slug, name:c.name, message:c.message,
            created_at: typeof c.created_at === "string" ? c.created_at : undefined,
            approved: c.approved === true,
          }, {onConflict:"id"});
          if (error) throw new Error(`评论“${c.name}”导入失败：${error.message}`);
          cmCount++;
        }
      }
      await cleanupOrphanTags();
      await logAudit("backup_import","backup",file.name,`${catCount} 个分类、${tagCount} 个标签、${bmCount} 条书签、${artCount} 篇文章、${recCount} 条推荐链接、${gbCount} 条留言、${cmCount} 条评论`);
      say("ok",`备份导入完成：${catCount} 个分类、${tagCount} 个标签、${bmCount} 条书签、${artCount} 篇文章、${recCount} 条推荐链接、${gbCount} 条留言、${cmCount} 条评论。`);
      loadBookmarks(); loadTags(); loadCategories(); loadArticles();
    } catch (err:any) {
      say("err",`导入失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  }
  async function deleteBookmark(id:string){
    if(!supabase)return;
    const {error}=await supabase.from("bookmarks").delete().eq("id",id);
    if(error)say("err",error.message);else{say("ok","书签已删除。");await logAudit("bookmark_delete","bookmark",id);setSelected(s=>s.filter(x=>x!==id));await cleanupOrphanTags();loadBookmarks();loadTags()}
  }
  async function setBookmarkStatus(id:string, status:"active"|"archived"){
    if(!supabase)return;
    const {error}=await supabase.from("bookmarks").update({status}).eq("id",id);
    if(error)say("err",error.message);else{say("ok",status==="archived"?"书签已归档。":"书签已恢复。");loadBookmarks()}
  }
  async function batchDeleteBookmarks(ids:string[]){
    if(!supabase)return;
    const {error}=await supabase.from("bookmarks").delete().in("id",ids);
    if(error)say("err",error.message);else{say("ok",`已删除 ${ids.length} 条书签。`);setSelected([]);await cleanupOrphanTags();loadBookmarks();loadTags()}
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
    setPreviewMode("edit");
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
    setPreviewMode("edit");
    say("ok",`正在编辑：${file.slug}`);
  }
  // 3.0 P0 预览与发布工作流：draftOverride 显式指定保存为草稿还是发布。
  // 不传则用表单当前的 draft 复选框状态（兼容回车提交）。
  async function saveArticle(e:React.FormEvent | React.MouseEvent, draftOverride?: boolean){
    if (e) e.preventDefault();
    if(!supabase || !session)return;
    const slug = article.slug.trim();
    if (!SLUG_RE.test(slug)) { say("err","slug 只能包含字母、数字、- 和 _，例如 ai-tools-notes。"); return; }
    if (!article.title.trim()) { say("err","请填写文章标题。"); return; }
    if (!DATE_RE.test(article.pubDate)) { say("err","发布日期格式应为 YYYY-MM-DD。"); return; }
    if (!article.body.trim()) { say("err","正文不能为空。"); return; }
    const isEdit = editingSlug !== null;
    if (!isEdit && articles.some(a=>a.slug===slug)) { say("err",`slug “${slug}” 已存在，请换一个 slug，或先编辑已有文章。`); return; }
    const draft = draftOverride !== undefined ? draftOverride : article.draft;
    // 发布草稿时提示"文章已发布"而不是"文章已更新"（草稿转发布是发布动作）。
    const wasDraft = article.draft;
    const isFuture = new Date(article.pubDate).getTime() > Date.now();
    setSaving(true);say("ok","");
    const path = `src/content/blog/${slug}.md`;
    const content = buildArticleMarkdown({...article,slug,draft}, isEdit);
    const {data,error} = await callFunction({action:"upsert",path,content});
    setSaving(false);
    if (error) { say("err",`保存失败：${error.message}`); return; }
    const commit = (data as any)?.commit as string | undefined;
    const statusText = draft ? "已保存为草稿" : isFuture ? `已保存，将于 ${article.pubDate} 自动发布` : (wasDraft || !isEdit ? "文章已发布" : "文章已更新");
    say("ok", `${statusText}${commit ? `（提交 ${commit.slice(0,7)}）` : ""}，部署完成后生效。`);
    await logAudit(isEdit ? "article_update" : "article_create","article",slug,commit ? `提交 ${commit.slice(0,7)}` : undefined);
    // 3.0 P0：保存成功后存一条版本快照（失败不影响文章保存本身）。
    await saveArticleVersion(slug, article.title.trim(), content);
    // 新建文章保存后切到编辑模式，版本历史立即出现，不必再点一次 编辑。
    if (!isEdit) setEditingSlug(slug);
    setArticle({...article, draft});
    // 保存即刷新：先把本次保存乐观写入列表（不等 GitHub 列表接口），
    // 再立即 + 6 秒后各向服务器确认一次（合并逻辑见 loadArticles）。
    const optimistic: ArticleFile = {
      name: `${slug}.md`,
      slug,
      path,
      sha: articles.find(a => a.slug === slug)?.sha || "",
      size: content.length,
    };
    recentArticleSaves.current.set(slug, { file: optimistic, at: Date.now() });
    recentArticleDeletes.current.delete(path);
    setArticles(prev => [optimistic, ...prev.filter(a => a.slug !== slug)]);
    loadArticles();
    window.setTimeout(() => { loadArticles(); }, 6000);
  }
  // 3.0 P0：把本次保存的完整 Markdown 存为一条版本快照。
  async function saveArticleVersion(slug: string, title: string, content: string) {
    if (!supabase) return;
    try {
      const { data: latest } = await supabase
        .from("article_versions")
        .select("version_number")
        .eq("article_slug", slug)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const next = ((latest as { version_number?: number } | null)?.version_number || 0) + 1;
      const email = (session as any)?.user?.email as string | undefined;
      const { error } = await supabase.from("article_versions").insert({
        article_slug: slug,
        title,
        content,
        version_number: next,
        created_by: email || null,
      });
      if (error) {
        // 表不存在（未执行 008 迁移）时静默跳过，不干扰保存流程。
        if (error.code !== "42P01") say("err", `文章已保存，但版本快照写入失败：${error.message}`);
        return;
      }
      setVersionTick((t) => t + 1);
    } catch {
      /* 版本快照失败不影响文章保存 */
    }
  }
  // 3.0 P0：把旧版本内容载入编辑器；点保存后会产生一条新版本。
  function restoreVersion(v: ArticleVersion) {
    const parsed = parseArticle(v.content);
    parsed.slug = v.article_slug;
    setArticle(parsed);
    setEditingSlug(v.article_slug);
    say("ok", `已载入 v${v.version_number} 的内容，确认无误后点保存即可恢复为新版本。`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function deleteArticle(path: string){
    const {data,error} = await callFunction({action:"delete",path});
    if (error) { say("err",`删除失败：${error.message}`); return; }
    const commit = (data as any)?.commit as string | undefined;
    say("ok",`文章已删除${commit ? `（提交 ${commit.slice(0,7)}）` : ""}，部署完成后生效。`);
    await logAudit("article_delete","article",path,commit ? `提交 ${commit.slice(0,7)}` : undefined);
    if (editingSlug && path === `src/content/blog/${editingSlug}.md`) newArticle();
    // 删除即刷新：先从列表乐观移除，再立即 + 6 秒后向服务器确认
    // （合并逻辑见 loadArticles，防止 GitHub 旧列表把已删文章“复活”）。
    recentArticleDeletes.current.set(path, Date.now());
    const slugFromPath = path.split("/").pop()?.replace(/\.md$/, "") || "";
    if (slugFromPath) recentArticleSaves.current.delete(slugFromPath);
    setArticles(prev => prev.filter(a => a.path !== path));
    loadArticles();
    window.setTimeout(() => { loadArticles(); }, 6000);
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
    if (t.kind === "reclink" && t.id) await deleteRecLink(t.id);
    if (t.kind === "guestbook" && t.id) await deleteGbEntry(t.id);
    if (t.kind === "comment" && t.id) await deleteComment(t.id);
  }

  if(!hasSupabaseConfig)return <div className="empty-state">尚未配置 Supabase。请先复制 <code>.env.example</code> 为 <code>.env</code>，填写公开项目 URL 和 anon key，再重新启动网站。</div>;
  function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i=0; i<text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i+1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ""; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === '\r') { /* skip */ }
        else field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r=>r.some(cell=>cell.trim()!==""));
  }
  function toCSVCell(v: string): string {
    if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g,'""') + '"';
    return v;
  }
  function toCSV(rows: string[][]): string {
    return rows.map(r=>r.map(toCSVCell).join(",")).join("\r\n");
  }
  function slugifyCategory(name: string): string {
    const s = name.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    return s || ("collection-" + Math.random().toString(36).slice(2,8));
  }
  async function importRaindrop(file: File){
    if(!supabase) return;
    const text = await file.text();
    type RDItem = {url:string;title:string;description:string;note:string;tags:string[];category:string;is_favorite:boolean};
    const items: RDItem[] = [];
    const isCSV = file.name.toLowerCase().endsWith(".csv") || /^\s*"?id"?\s*,/i.test(text.slice(0,200)) || text.slice(0,500).includes(",url,");
    const isHTML = text.includes("NETSCAPE-Bookmark-file-1") || file.name.toLowerCase().endsWith(".html") || file.name.toLowerCase().endsWith(".htm");
    if (isCSV) {
      const rows = parseCSV(text);
      if (!rows.length) { say("err","CSV 文件为空。"); return; }
      const header = rows[0].map(h=>h.trim().toLowerCase());
      const idx = (name: string) => header.indexOf(name);
      const urlIdx = idx("url");
      if (urlIdx < 0) { say("err","CSV 里没有 url 列。请上传 Raindrop 导出的 CSV 文件。"); return; }
      const titleIdx = idx("title"), noteIdx = idx("note"), excerptIdx = idx("excerpt"),
            folderIdx = idx("folder"), tagsIdx = idx("tags"), favIdx = idx("favorite");
      for (let i=1;i<rows.length;i++){
        const r = rows[i];
        const url = (r[urlIdx]||"").trim();
        if (!/^https?:\/\/.+/.test(url)) continue;
        items.push({
          url: normalizeUrl(url),
          title: (titleIdx>=0 ? (r[titleIdx]||"") : "").trim() || url,
          description: (excerptIdx>=0 ? (r[excerptIdx]||"") : "").trim(),
          note: (noteIdx>=0 ? (r[noteIdx]||"") : "").trim(),
          tags: parseTagNames((tagsIdx>=0 ? (r[tagsIdx]||"") : "").replace(/;/g,",")),
          category: (folderIdx>=0 ? (r[folderIdx]||"") : "").trim() || "AI & Tools",
          is_favorite: favIdx>=0 ? ["true","1","yes"].includes((r[favIdx]||"").trim().toLowerCase()) : false,
        });
      }
    } else if (isHTML) {
      const doc = new DOMParser().parseFromString(text, "text/html");
      const links = doc.querySelectorAll("a[href]");
      links.forEach(a=>{
        const url = (a.getAttribute("href")||"").trim();
        if (!/^https?:\/\/.+/.test(url)) return;
        let folder = "AI & Tools";
        let parent: Element | null = a.parentElement;
        while (parent && folder === "AI & Tools") {
          let sib: Element | null = parent.previousElementSibling;
          while (sib) {
            if (sib.tagName === "H3") { folder = sib.textContent?.trim() || folder; break; }
            sib = sib.previousElementSibling;
          }
          parent = parent.parentElement;
        }
        items.push({
          url: normalizeUrl(url),
          title: (a.textContent||"").trim() || url,
          description: "",
          note: "",
          tags: parseTagNames(a.getAttribute("tags")||""),
          category: folder,
          is_favorite: false,
        });
      });
    } else {
      say("err","无法识别的文件格式。请上传 Raindrop 导出的 CSV 或 HTML 书签文件。");
      return;
    }
    if (!items.length) { say("err","文件里没有找到有效的书签。"); return; }
    setSaving(true); say("ok",`正在导入 ${items.length} 条书签…`);
    let imported = 0, skipped = 0;
    try {
      for (const it of items) {
        const catName = it.category;
        const {data: cat} = await supabase.from("categories").select("id").eq("name",catName).single();
        if (!cat) {
          await supabase.from("categories").insert({name:catName, slug: slugifyCategory(catName)});
        }
        const payload = {
          url: it.url,
          title: it.title,
          description: it.description || null,
          note: it.note || null,
          category: catName,
          is_public: true,
          is_favorite: it.is_favorite,
          status: "active",
        };
        const res = await supabase.from("bookmarks").upsert(payload, {onConflict:"url"}).select("id").single();
        if (res.error) { skipped++; continue; }
        const bookmarkId = (res.data as any).id as string;
        await syncBookmarkTags(bookmarkId, it.tags);
        imported++;
      }
      await cleanupOrphanTags();
      say("ok",`Raindrop 导入完成：${imported} 条已导入${skipped?`，${skipped} 条失败`:""}。导入的书签默认为公开，如需设为私人请在书签管理里修改。`);
      loadBookmarks(); loadTags(); loadCategories();
    } catch (err:any) {
      say("err",`导入失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  }
  async function exportRaindrop(){
    if(!supabase) return;
    const {data,error} = await supabase.from("bookmarks").select("id,url,title,description,note,category,is_favorite,created_at,bookmark_tags(tags(name))").order("created_at",{ascending:true});
    if (error) { say("err",`导出失败：${error.message}`); return; }
    const rows: string[][] = [["id","title","note","excerpt","url","folder","tags","created","cover","highlights","favorite"]];
    ((data||[]) as any[]).forEach((b,i)=>{
      const tags = ((b.bookmark_tags||[]) as any[]).map(bt=>bt.tags?.name).filter(Boolean).join(",");
      rows.push([
        String(b.id || i+1),
        b.title || "",
        b.note || "",
        b.description || "",
        b.url || "",
        b.category || "",
        tags,
        b.created_at ? new Date(b.created_at).toISOString() : "",
        "",
        "",
        b.is_favorite ? "true" : "false",
      ]);
    });
    const csv = toCSV(rows);
    const blob = new Blob(["\uFEFF" + csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raindrop-export-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    await logAudit("raindrop_export","bookmarks",`${rows.length-1} 条书签`,`Raindrop CSV`);
    say("ok",`已导出 ${rows.length-1} 条书签为 Raindrop CSV，可直接导入 Raindrop。`);
  }
  async function exportArticleMarkdown(slug:string){
    if(!supabase) return;
    const {data,error} = await callFunction({action:"get", path:`src/content/blog/${slug}.md`});
    if (error) { say("err",`导出失败：${error.message}`); return; }
    const content = (data as any)?.content as string;
    if (typeof content !== "string") { say("err","导出失败：文章内容异常。"); return; }
    const blob = new Blob([content], {type:"text/markdown;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    await logAudit("article_export","article",slug,"Markdown");
    say("ok",`文章 ${slug}.md 已下载。`);
  }
  async function exportBookmarksJSON(){
    if(!supabase) return;
    const payload = {
      version: 1,
      app: "OUTAI",
      exportedAt: new Date().toISOString(),
      bookmarks: items.map(b=>({
        url:b.url, title:b.title, description:b.description, note:b.note,
        category:b.category, is_public:b.is_public, is_favorite:b.is_favorite,
        status:b.status, tags:b.tags, created_at:(b as any).created_at ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outai-bookmarks-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    await logAudit("bookmarks_export","bookmarks",`${items.length} 条书签`,"JSON");
    say("ok",`已导出 ${items.length} 条书签为 JSON。`);
  }
  async function uploadCoverImage(file: File){
    if(!supabase) return;
    if(!file.type.startsWith("image/")) { say("err","请选择图片文件。"); return; }
    if(file.size > 5*1024*1024) { say("err","图片不能超过 5 MB。"); return; }
    const ext = (file.name.split(".").pop()||"").toLowerCase();
    const safeExt = ["jpg","jpeg","png","gif","webp","avif"].includes(ext) ? ext : "png";
    const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${safeExt}`;
    say("ok","正在上传封面图…");
    const {error} = await supabase.storage.from("article-images").upload(path, file, {contentType: file.type, upsert:false});
    if (error) { say("err",`封面图上传失败：${error.message}`); return; }
    const {data} = supabase.storage.from("article-images").getPublicUrl(path);
    setArticle(f=>({...f, cover: data.publicUrl}));
    say("ok","封面图已上传。");
  }
  if(!session)return <div className="card" style={{maxWidth:440}}>
    <div className="eyebrow">ADMIN AUTHENTICATION</div><h3>管理员登录</h3>
    <form onSubmit={login} style={{display:"grid",gap:12}}>
      <input className={inputClass} type="email" required placeholder="管理员邮箱" value={email} onChange={e=>setEmail(e.target.value)}/>
      <input className={inputClass} type="password" required placeholder="密码" value={password} onChange={e=>setPassword(e.target.value)}/>
      <button className="button primary" type="submit">登录后台 ↗</button>
    </form>
    {message&&<p style={{color:msgKind==="err"?"#f28b82":"#61edff"}}>{message}</p>}
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
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className={`button ${tab==="modules"?"primary":"secondary"}`} onClick={()=>setTab("modules")}>首页模块</button>
        <button className={`button ${tab==="nav"?"primary":"secondary"}`} onClick={()=>setTab("nav")}>导航管理</button>
        <button className={`button ${tab==="hero"?"primary":"secondary"}`} onClick={()=>setTab("hero")}>首页 Hero</button>
        <button className={`button ${tab==="projects"?"primary":"secondary"}`} onClick={()=>setTab("projects")}>项目管理</button>
        <button className={`button ${tab==="changelog"?"primary":"secondary"}`} onClick={()=>setTab("changelog")}>更新日志</button>
        <button className={`button ${tab==="pages"?"primary":"secondary"}`} onClick={()=>setTab("pages")}>页面内容</button>
        <button className={`button ${tab==="toolbox"?"primary":"secondary"}`} onClick={()=>setTab("toolbox")}>工具箱</button>
        <button className={`button ${tab==="bookmarks"?"primary":"secondary"}`} onClick={()=>setTab("bookmarks")}>书签管理</button>
        <button className={`button ${tab==="articles"?"primary":"secondary"}`} onClick={()=>setTab("articles")}>文章管理</button>
        <button className={`button ${tab==="links"?"primary":"secondary"}`} onClick={()=>setTab("links")}>推荐链接</button>
        <button className={`button ${tab==="guestbook"?"primary":"secondary"}`} onClick={()=>setTab("guestbook")}>留言板</button>
        <button className={`button ${tab==="media"?"primary":"secondary"}`} onClick={()=>setTab("media")}>背景与媒体</button>
        <button className={`button ${tab==="background"?"primary":"secondary"}`} onClick={()=>setTab("background")}>背景管理</button>
        <button className={`button ${tab==="universe"?"primary":"secondary"}`} onClick={()=>setTab("universe")}>3D 宇宙管理</button>
        <button className={`button ${tab==="data"?"primary":"secondary"}`} onClick={()=>setTab("data")}>数据管理</button>
      </div>
      <button className="button secondary" onClick={logout}>退出登录</button>
    </div>
    {tab==="modules" ? <HomeModuleAdmin say={say} /> : tab==="nav" ? <NavAdmin say={say} /> : tab==="hero" ? <HeroAdmin say={say} /> : tab==="projects" ? <ProjectsAdmin say={say} /> : tab==="changelog" ? <ChangelogAdmin say={say} /> : tab==="pages" ? <PageContentAdmin say={say} /> : tab==="toolbox" ? <ToolboxAdmin say={say} /> : tab==="universe" ? <UniverseAdmin say={say} /> : tab==="bookmarks" ? <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
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
                  {x.is_favorite&&<span style={{fontSize:11,color:"#61edff",marginLeft:6}}>精选</span>}
                  <div style={{fontSize:11,color:"#929dab",marginTop:5}}>{x.is_public?"公开":"私人"} · {x.category} · {x.url}</div>
                  {x.tags.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>{x.tags.map(t=><span className="tag" key={t}>{t}</span>)}</div>}
                </span>
              </span>
              <span style={{display:"flex",gap:10,whiteSpace:"nowrap"}}>
                <button onClick={()=>editBookmark(x)} style={{background:"none",border:0,color:"#61edff",cursor:"pointer"}}>编辑</button>
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
                <button onClick={()=>exportArticleMarkdown(a.slug)} style={{background:"none",border:0,color:"#aab3c0",cursor:"pointer"}}>下载 .md</button>
                <button onClick={()=>editArticle(a)} style={{background:"none",border:0,color:"#61edff",cursor:"pointer"}}>编辑</button>
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
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <h3 style={{margin:0}}>{editingSlug ? `编辑文章：${editingSlug}` : "新建文章"}</h3>
          <span style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,border:"1px solid #29313c",borderRadius:999,padding:"2px 8px",color: article.draft ? "#fbbf24" : (article.pubDate && new Date(article.pubDate).getTime() > Date.now() ? "#a68aff" : "#7dffce")}}>
              {article.draft ? "草稿" : (article.pubDate && new Date(article.pubDate).getTime() > Date.now() ? `定时发布 · ${article.pubDate}` : "已发布")}
            </span>
            <button type="button" className={previewMode==="edit" ? "button primary" : "button secondary"} onClick={()=>setPreviewMode("edit")}>编辑</button>
            <button type="button" className={previewMode==="preview" ? "button primary" : "button secondary"} onClick={()=>setPreviewMode("preview")}>预览</button>
          </span>
        </div>
        {previewMode==="preview" ? <ArticlePreview article={article}/> : <>
        <input className={inputClass} required placeholder="文章标题" value={article.title} onChange={e=>setArticle({...article,title:e.target.value})}/>
        {editingSlug ? <div style={{fontSize:12,color:"#929dab"}}>slug：<code>{editingSlug}</code>（编辑时不可改 slug，改 slug 请删除后新建）</div>
        : <input className={inputClass} required placeholder="URL slug，例如 ai-tools-notes（仅字母、数字、-、_）" value={article.slug} onChange={e=>setArticle({...article,slug:e.target.value})}/>}
        <input className={inputClass} placeholder="文章简介" value={article.description} onChange={e=>setArticle({...article,description:e.target.value})}/>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <input className={inputClass} placeholder="分类" value={article.category} onChange={e=>setArticle({...article,category:e.target.value})}/>
          <input className={inputClass} placeholder="标签，逗号分隔" value={article.tags} onChange={e=>setArticle({...article,tags:e.target.value})}/>
          <input className={inputClass} type="date" value={article.pubDate} onChange={e=>setArticle({...article,pubDate:e.target.value})} title="发布日期"/>
        </div>
        <div>
          <input className={inputClass} type="url" placeholder="封面图片 URL（可选）" value={article.cover} onChange={e=>setArticle({...article,cover:e.target.value})}/>
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,flexWrap:"wrap"}}>
            <input type="file" accept="image/*" ref={coverFileRef} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0]; if(f) uploadCoverImage(f); e.target.value="";}}/>
            <button type="button" className="button secondary" onClick={()=>coverFileRef.current?.click()} disabled={saving}>上传封面图（最大 5 MB）</button>
            {article.cover && <button type="button" className="button ghost" onClick={()=>setArticle({...article,cover:""})}>清除封面</button>}
          </div>
          {article.cover && <img src={article.cover} alt="封面预览" style={{maxWidth:"100%",maxHeight:220,marginTop:8,borderRadius:8,border:"1px solid #1e293b"}}/>}
        </div>
        <input className={inputClass} placeholder="SEO 标题（可选，默认用文章标题）" value={article.seoTitle} onChange={e=>setArticle({...article,seoTitle:e.target.value})}/>
        <input className={inputClass} placeholder="SEO 描述（可选，默认用文章简介）" value={article.seoDescription} onChange={e=>setArticle({...article,seoDescription:e.target.value})}/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={article.draft} onChange={e=>setArticle({...article,draft:e.target.checked})}/> 草稿（不公开显示）</label>
          <label style={{fontSize:12,color:"#aab3c0"}}><input type="checkbox" checked={article.featured} onChange={e=>setArticle({...article,featured:e.target.checked})}/> 精选文章</label>
        </div>
        <textarea className={inputClass} rows={18} placeholder="使用 Markdown 编写正文…" value={article.body} onChange={e=>setArticle({...article,body:e.target.value})}/>
        </>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {article.draft || !editingSlug ? <>
            <button type="button" className="button secondary" disabled={saving} onClick={(e)=>saveArticle(e, true)}>{saving?"提交中…":"保存草稿"}</button>
            <button type="button" className="button primary" disabled={saving} onClick={(e)=>saveArticle(e, false)}>{saving?"提交中…":"发布"}</button>
          </> : <>
            <button type="button" className="button primary" disabled={saving} onClick={(e)=>saveArticle(e, false)}>{saving?"提交中…":"保存修改"}</button>
            <button type="button" className="button secondary" disabled={saving} onClick={(e)=>saveArticle(e, true)}>{saving?"提交中…":"转为草稿"}</button>
          </>}
        </div>
        <p style={{color:"#929dab",fontSize:12}}>保存通过 Supabase Edge Function 调用 GitHub API，服务端会校验 frontmatter，非法内容会被拒绝。发布日期在未来时，文章会在该日期自动上线（每天 00:00 UTC 重建）。</p>
        {editingSlug ? <ArticleVersionHistory slug={editingSlug} refreshTick={versionTick} onRestore={restoreVersion} /> : null}
      </form>
    </div> : tab==="links" ? <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
      <form className="card" onSubmit={saveRecLink} style={{display:"grid",gap:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h3>{editingRecId ? "编辑推荐链接" : "添加推荐链接"}</h3>
          {editingRecId&&<button type="button" onClick={()=>{setRecForm(emptyRecLinkForm());setEditingRecId(null);}} style={{background:"none",border:0,color:"#929dab",cursor:"pointer",fontSize:12}}>取消编辑</button>}
        </div>
        <input className={inputClass} type="url" required placeholder="https://example.com" value={recForm.url} onChange={e=>setRecForm({...recForm,url:e.target.value})}/>
        <input className={inputClass} required placeholder="标题" value={recForm.title} onChange={e=>setRecForm({...recForm,title:e.target.value})}/>
        <input className={inputClass} placeholder="描述（可选）" value={recForm.description} onChange={e=>setRecForm({...recForm,description:e.target.value})}/>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <input className={inputClass} placeholder="分类（可选）" value={recForm.category} onChange={e=>setRecForm({...recForm,category:e.target.value})}/>
          <input className={inputClass} type="number" placeholder="排序（数字越小越靠前）" value={recForm.sort_order} onChange={e=>setRecForm({...recForm,sort_order:e.target.value})}/>
        </div>
        <button className="button primary" disabled={saving}>{saving?"提交中…":(editingRecId?"保存修改":"添加推荐链接")}</button>
        <p style={{color:"#929dab",fontSize:12}}>保存后会显示在公开的 /links/ 页面上。</p>
      </form>
      <div className="card">
        <h3>推荐链接 ({recLinks.length})</h3>
        <div style={{display:"grid",gap:12,marginTop:12}}>
          {recLinks.map(l=><div key={l.id} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
              <strong style={{fontSize:13}}>{l.title}</strong>
              <span style={{display:"flex",gap:10}}>
                <button onClick={()=>editRecLink(l)} style={{background:"none",border:0,color:"#61edff",cursor:"pointer"}}>编辑</button>
                <button onClick={()=>setConfirmTarget({kind:"reclink",id:l.id,label:l.title})} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button>
              </span>
            </div>
            <div style={{fontSize:11,color:"#929dab",marginTop:5}}>{l.url}{l.category?` · ${l.category}`:""} · 排序 {l.sort_order}</div>
            {l.description && <div style={{fontSize:12,color:"#aab3c0",marginTop:4}}>{l.description}</div>}
          </div>)}
          {!recLinks.length&&<p style={{color:"#929dab",fontSize:12}}>还没有推荐链接，在左侧添加。</p>}
        </div>
        <button className="button secondary" onClick={loadRecLinks} style={{marginTop:12}}>刷新列表</button>
      </div>
    </div> : tab==="guestbook" ? <div className="card-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
      <div className="card">
        <h3>留言审核 ({gbEntries.length})</h3>
        <p style={{color:"#929dab",fontSize:12}}>访客留言需要通过审核后才会在公开的 /guestbook/ 页面显示。待审核的留言排在前面。</p>
        <div style={{display:"grid",gap:12,marginTop:12}}>
          {gbEntries.map(en=><div key={en.id} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
              <strong style={{fontSize:13}}>{en.name} {en.approved ? <span style={{color:"#61edff",fontSize:11}}>已公开</span> : <span style={{color:"#f2c94c",fontSize:11}}>待审核</span>}{en.pinned ? <span style={{color:"#f2c94c",fontSize:11,marginLeft:6}}>置顶</span> : null}</strong>
              <span style={{display:"flex",gap:10}}>
                {en.approved
                  ? <button onClick={()=>setGbApproved(en.id,false)} style={{background:"none",border:0,color:"#f2c94c",cursor:"pointer"}}>撤回</button>
                  : <button onClick={()=>setGbApproved(en.id,true)} style={{background:"none",border:0,color:"#61edff",cursor:"pointer"}}>通过</button>}
                {en.approved ? <button onClick={()=>setGbPinned(en.id,!en.pinned)} style={{background:"none",border:0,color:"#f2c94c",cursor:"pointer"}}>{en.pinned ? "取消置顶" : "置顶"}</button> : null}
                <button onClick={()=>setConfirmTarget({kind:"guestbook",id:en.id,label:`${en.name} 的留言`})} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button>
              </span>
            </div>
            <div style={{fontSize:12,color:"#aab3c0",marginTop:5,whiteSpace:"pre-wrap"}}>{en.message}</div>
            <div style={{fontSize:11,color:"#929dab",marginTop:5}}>{new Date(en.created_at).toLocaleString("zh-CN")}</div>
          </div>)}
          {!gbEntries.length&&<p style={{color:"#929dab",fontSize:12}}>还没有留言。</p>}
        </div>
        <button className="button secondary" onClick={loadGbEntries} style={{marginTop:12}}>刷新列表</button>
      </div>
      <div className="card">
        <h3>评论审核 ({comments.length})</h3>
        <p style={{color:"#929dab",fontSize:12}}>文章评论需要通过审核后才会在文章页公开显示。待审核的评论排在前面。</p>
        <div style={{display:"grid",gap:12,marginTop:12}}>
          {comments.map(c=><div key={c.id} style={{borderBottom:"1px solid #29313c",paddingBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
              <strong style={{fontSize:13}}>{c.name} {c.approved ? <span style={{color:"#61edff",fontSize:11}}>已公开</span> : <span style={{color:"#f2c94c",fontSize:11}}>待审核</span>}</strong>
              <span style={{display:"flex",gap:10}}>
                {c.approved
                  ? <button onClick={()=>setCommentApproved(c.id,false)} style={{background:"none",border:0,color:"#f2c94c",cursor:"pointer"}}>撤回</button>
                  : <button onClick={()=>setCommentApproved(c.id,true)} style={{background:"none",border:0,color:"#61edff",cursor:"pointer"}}>通过</button>}
                <button onClick={()=>setConfirmTarget({kind:"comment",id:c.id,label:`${c.name} 的评论`})} style={{background:"none",border:0,color:"#f28b82",cursor:"pointer"}}>删除</button>
              </span>
            </div>
            <div style={{fontSize:11,color:"#929dab",marginTop:4}}>文章：{c.article_slug}</div>
            <div style={{fontSize:12,color:"#aab3c0",marginTop:5,whiteSpace:"pre-wrap"}}>{c.message}</div>
            <div style={{fontSize:11,color:"#929dab",marginTop:5}}>{new Date(c.created_at).toLocaleString("zh-CN")}</div>
          </div>)}
          {!comments.length&&<p style={{color:"#929dab",fontSize:12}}>还没有评论。</p>}
        </div>
        <button className="button secondary" onClick={loadComments} style={{marginTop:12}}>刷新列表</button>
      </div>
    </div> : tab==="background" ? <BackgroundStudio say={say} /> : tab==="media" ? <VideoSceneAdmin say={say} logAudit={logAudit} /> : <div style={{display:"grid",gap:16}}>
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
          <div style={{fontSize:26,fontWeight:700,color:"#61edff"}}>{s.value}</div>
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
                  <button onClick={()=>{setEditingTagId(t.id);setEditingTagName(t.name);}} style={{background:"none",border:0,color:"#61edff",cursor:"pointer"}}>重命名</button>
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
                  <button onClick={()=>{setEditingCatId(c.id);setEditingCatName(c.name);}} style={{background:"none",border:0,color:"#61edff",cursor:"pointer"}}>重命名</button>
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
            {topCategories.map(c=><div key={c.name} style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span>{c.name}</span><span style={{color:"#61edff"}}>{c.count}</span></div>)}
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
      <div className="card">
        <h3>Raindrop 导入/导出</h3>
        <p style={{color:"#929dab",fontSize:12}}>从 Raindrop 导入：在 Raindrop 里导出备份（CSV 或 HTML 书签文件），上传到这里即可导入。文件夹会变成分类，标签会保留，导入的书签默认为公开。导出：把本站书签导出为 Raindrop 格式的 CSV，可直接导入 Raindrop。</p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
          <button className="button primary" onClick={exportRaindrop} disabled={saving}>导出为 Raindrop CSV</button>
          <input type="file" accept=".csv,.html,.htm,text/csv,text/html" ref={raindropFileRef} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0]; if(f) importRaindrop(f); e.target.value="";}}/>
          <button className="button secondary" onClick={()=>raindropFileRef.current?.click()} disabled={saving}>选择 Raindrop 文件导入</button>
        </div>
      </div>
      <div className="card">
        <h3>备份与恢复</h3>
        <p style={{color:"#929dab",fontSize:12}}>导出会把全部书签（含标签）、分类、标签、文章全文、推荐链接、留言、评论和图片清单打包成一个 JSON 文件下载到本地（备份格式 v2；旧版 v1 备份仍可导入）。导入会按 URL、slug 和 ID 去重合并，不会删除备份文件里没有的内容。</p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
          <button className="button primary" onClick={exportBackup} disabled={saving}>导出备份 (JSON)</button>
          <input type="file" accept="application/json,.json" ref={fileRef} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0]; if(f) importBackup(f); e.target.value="";}}/>
          <button className="button secondary" onClick={()=>fileRef.current?.click()} disabled={saving}>选择备份文件导入</button>
          <button className="button secondary" onClick={exportBookmarksJSON} disabled={saving}>仅导出书签 (JSON)</button>
        </div>
      </div>
      <div className="card">
        <h3>操作日志</h3>
        <p style={{color:"#929dab",fontSize:12}}>记录管理员的操作（登录、发布、删除、导入、导出等），最新 50 条，仅管理员可见。</p>
        <div style={{display:"grid",gap:8,marginTop:12}}>
          {auditLog.map(en=><div key={en.id} style={{borderBottom:"1px solid #29313c",paddingBottom:8,fontSize:12}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
              <span><strong style={{color:"#61edff"}}>{en.action}</strong>{en.target_label ? ` · ${en.target_label}` : ""}</span>
              <span style={{color:"#929dab",whiteSpace:"nowrap"}}>{new Date(en.created_at).toLocaleString("zh-CN")}</span>
            </div>
            {(en.detail || en.admin_email) && <div style={{color:"#aab3c0",marginTop:4}}>{en.detail}{en.admin_email ? ` — ${en.admin_email}` : ""}</div>}
          </div>)}
          {!auditLog.length&&<p style={{color:"#929dab",fontSize:12}}>还没有操作记录。</p>}
        </div>
        <button className="button secondary" onClick={loadAuditLog} style={{marginTop:12}}>刷新日志</button>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button className="button secondary" onClick={()=>{loadBookmarks();loadTags();loadCategories();loadArticles();}}>刷新全部数据</button>
      </div>
    </div>}
    {confirmTarget&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50}} onClick={()=>setConfirmTarget(null)}>
      <div className="card" style={{maxWidth:420,width:"90%"}} onClick={e=>e.stopPropagation()}>
        <h3>确定删除？</h3>
        <p style={{color:"#aab3c0",fontSize:13}}>即将删除{confirmTarget.kind==="article"?"文章":confirmTarget.kind==="tag"?"标签":confirmTarget.kind==="category"?"分类":confirmTarget.kind==="reclink"?"推荐链接":confirmTarget.kind==="guestbook"?"留言":confirmTarget.kind==="comment"?"评论":"书签"}「{confirmTarget.label}」{confirmTarget.kind==="category"?"，相关书签将设为未分类":""}{confirmTarget.kind==="tag"?"，该标签将从所有书签上移除":""}，此操作不可撤销。</p>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
          <button className="button secondary" onClick={()=>setConfirmTarget(null)}>取消</button>
          <button className="button primary" style={{background:"#f28b82",borderColor:"#f28b82",color:"#1a1d21"}} onClick={runConfirmedDelete}>确定删除</button>
        </div>
      </div>
    </div>}
    {message&&<div className="empty-state" style={{marginTop:18,color:msgKind==="err"?"#f28b82":"#61edff"}}>{message}</div>}
  </div>;
}
