// home-modules.ts — 首页模块（数字宇宙门户）。
// 首页的模块卡片与导航入口由此表驱动，不硬编码在首页组件里。
// 构建时从 Supabase 读取已发布且启用的模块；失败或为空时回退到内置默认模块。
import { supabase } from "@/lib/supabase";

export type HomeModule = {
  id: string;
  name: string;
  name_en: string;
  description: string;
  icon: string;
  cover_image: string;
  theme_color: string;
  path: string;
  category: string;
  sort_order: number;
  show_on_home: boolean;
  enabled: boolean;
  show_in_nav: boolean;
  featured: boolean;
  status: string;
};

// 内置默认模块（Supabase 不可用或表为空时的回退；与 migration 009 种子一致）。
export const DEFAULT_MODULES: HomeModule[] = [
  { id: "articles", name: "文章中心", name_en: "Knowledge Galaxy", description: "技术记录、AI、互联网、经验分享。", icon: "✦", cover_image: "", theme_color: "#61EDFF", path: "/blog/", category: "内容", sort_order: 10, show_on_home: true, enabled: true, show_in_nav: true, featured: true, status: "published" },
  { id: "bookmarks", name: "书签收藏", name_en: "Resource Star Map", description: "网站、工具、资源和分类收藏。", icon: "◈", cover_image: "", theme_color: "#A68AFF", path: "/collection/", category: "内容", sort_order: 20, show_on_home: true, enabled: true, show_in_nav: true, featured: false, status: "published" },
  { id: "projects", name: "项目空间", name_en: "Build Log", description: "个人项目、作品和开发进度。", icon: "⬡", cover_image: "", theme_color: "#7DFFCE", path: "/projects/", category: "内容", sort_order: 30, show_on_home: true, enabled: true, show_in_nav: true, featured: false, status: "published" },
  { id: "guestbook", name: "留言板", name_en: "Guestbook", description: "访客留言、建议和交流。", icon: "✉", cover_image: "", theme_color: "#61EDFF", path: "/guestbook/", category: "互动", sort_order: 40, show_on_home: true, enabled: true, show_in_nav: true, featured: false, status: "published" },
  { id: "resources", name: "资源中心", name_en: "Resources", description: "软件、工具、教程和实用资源。", icon: "⬢", cover_image: "", theme_color: "#A68AFF", path: "/links/", category: "内容", sort_order: 50, show_on_home: true, enabled: true, show_in_nav: false, featured: false, status: "published" },
  { id: "changelog", name: "更新日志", name_en: "Changelog", description: "网站版本更新和功能变化。", icon: "✎", cover_image: "", theme_color: "#7DFFCE", path: "/changelog/", category: "关于", sort_order: 60, show_on_home: true, enabled: true, show_in_nav: false, featured: false, status: "published" },
  { id: "about", name: "关于我", name_en: "Identity", description: "个人介绍和网站说明。", icon: "◎", cover_image: "", theme_color: "#61EDFF", path: "/about/", category: "关于", sort_order: 70, show_on_home: true, enabled: true, show_in_nav: true, featured: false, status: "published" },
  { id: "now", name: "Now", name_en: "Now", description: "近期活动、正在做的事情。", icon: "◐", cover_image: "", theme_color: "#A68AFF", path: "/now/", category: "关于", sort_order: 80, show_on_home: true, enabled: true, show_in_nav: true, featured: false, status: "published" },
  { id: "toolbox", name: "在线工具箱", name_en: "Toolbox", description: "网站内的实用小工具。", icon: "⚙", cover_image: "", theme_color: "#7DFFCE", path: "/toolbox/", category: "工具", sort_order: 90, show_on_home: true, enabled: true, show_in_nav: false, featured: false, status: "published" },
  { id: "contact", name: "联系方式", name_en: "Contact", description: "X、GitHub 等公开社交入口。", icon: "↗", cover_image: "", theme_color: "#61EDFF", path: "/contact/", category: "关于", sort_order: 100, show_on_home: true, enabled: true, show_in_nav: true, featured: false, status: "published" },
];

// 构建时读取：已发布且启用、首页显示的模块，按 sort_order 排序。
export async function getHomeModules(): Promise<HomeModule[]> {
  try {
    if (!supabase) return DEFAULT_MODULES;
    const { data, error } = await supabase
      .from("home_modules")
      .select("id,name,name_en,description,icon,cover_image,theme_color,path,category,sort_order,show_on_home,enabled,show_in_nav,featured,status")
      .eq("status", "published")
      .eq("enabled", true)
      .eq("show_on_home", true)
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return DEFAULT_MODULES;
    return data as HomeModule[];
  } catch {
    return DEFAULT_MODULES;
  }
}

// 导航栏读取：已发布且启用、在导航显示的模块，按 sort_order 排序。
export async function getNavModules(): Promise<HomeModule[]> {
  try {
    if (!supabase) return DEFAULT_MODULES.filter((m) => m.show_in_nav);
    const { data, error } = await supabase
      .from("home_modules")
      .select("id,name,name_en,description,icon,cover_image,theme_color,path,category,sort_order,show_on_home,enabled,show_in_nav,featured,status")
      .eq("status", "published")
      .eq("enabled", true)
      .eq("show_in_nav", true)
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return DEFAULT_MODULES.filter((m) => m.show_in_nav);
    return data as HomeModule[];
  } catch {
    return DEFAULT_MODULES.filter((m) => m.show_in_nav);
  }
}
