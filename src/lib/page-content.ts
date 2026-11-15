// page-content.ts — 关于我 / Now / 联系方式 三个静态页的内容（后台可编辑）。
// 构建时从 Supabase page_content 读取；失败或缺失时回落到内置默认值
// （与当前页面文案一致）。改完后台需下次部署生效（每日自动重建）。
import { supabase } from "@/lib/supabase";

export type PageSection = { heading: string; text: string };
export type PageItem = { kicker?: string; title?: string; description?: string; heading?: string; label?: string; href?: string; note?: string };

export type PageContent = {
  id: string;
  title: string;
  subtitle: string;
  sections: PageSection[];
  items: PageItem[];
};

export const DEFAULT_PAGES: Record<string, PageContent> = {
  about: {
    id: "about",
    title: "关于这里",
    subtitle: "一个持续生长的个人数字空间。",
    sections: [
      { heading: "你好，我是 OUTAI。", text: "我关注 AI、互联网、开发工具、网络技术与数字生活，也喜欢把遇到的问题整理成可复用的经验。" },
      { heading: "这个网站", text: "这里会持续积累文章、书签、项目与个人记录。内容以真实体验和长期沉淀为主。" },
    ],
    items: [],
  },
  now: {
    id: "now",
    title: "最近在做什么",
    subtitle: "这是一份持续更新的当前状态记录。",
    sections: [],
    items: [
      { kicker: "LEARNING", title: "English", description: "持续学习英语，提升阅读技术资料与日常交流能力。" },
      { kicker: "EXPLORING", title: "AI & Automation", description: "探索 AI 工具、Agent 与个人自动化工作流。" },
      { kicker: "BUILDING", title: "OUTAI Website", description: "构建自己的文章与书签管理系统。" },
    ],
  },
  contact: {
    id: "contact",
    title: "联系我",
    subtitle: "有问题、建议，或者只是想打个招呼，都可以写邮件。",
    sections: [],
    items: [
      { heading: "邮箱", label: "outaidage@gmail.com", href: "mailto:outaidage@gmail.com", note: "" },
      { heading: "GitHub", label: "github.com/outaidage", href: "https://github.com/outaidage", note: "本站源代码：https://github.com/outaidage/outaidage.github.io" },
    ],
  },
};

function asSections(raw: unknown): PageSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ heading: typeof s.heading === "string" ? s.heading : "", text: typeof s.text === "string" ? s.text : "" }))
    .filter((s) => s.heading || s.text);
}

function asItems(raw: unknown): PageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i): i is Record<string, unknown> => !!i && typeof i === "object").map((i) => {
    const out: PageItem = {};
    for (const k of ["kicker", "title", "description", "heading", "label", "href", "note"] as const) {
      if (typeof i[k] === "string") out[k] = i[k] as string;
    }
    return out;
  });
}

export async function getPageContent(id: "about" | "now" | "contact"): Promise<PageContent> {
  const fallback = DEFAULT_PAGES[id];
  try {
    if (!supabase) return fallback;
    const { data, error } = await supabase
      .from("page_content")
      .select("title,subtitle,sections,items")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return fallback;
    return {
      id,
      title: typeof data.title === "string" && data.title ? data.title : fallback.title,
      subtitle: typeof data.subtitle === "string" ? data.subtitle : fallback.subtitle,
      sections: asSections(data.sections).length ? asSections(data.sections) : fallback.sections,
      items: asItems(data.items).length ? asItems(data.items) : fallback.items,
    };
  } catch {
    return fallback;
  }
}
