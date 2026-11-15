// hero-content.ts — 首页 Hero 内容（后台可编辑）。
// 构建时从 Supabase hero_content 读取单行（id='default'）；失败或缺失时
// 回落到内置默认值（与当前首页文案一致）。改完后台需下次部署生效
// （每日自动重建，或手动触发部署），后台会明确提示。
import { supabase } from "@/lib/supabase";

export type HeroButton = { label: string; href: string; style: "primary" | "secondary" };

export type HeroContent = {
  eyebrow: string;
  title_plain: string;
  title_grad: string;
  subtitle: string;
  buttons: HeroButton[];
  tags: string[];
  terminal_command: string;
  terminal_output: string;
};

export const DEFAULT_HERO: HeroContent = {
  eyebrow: "DIGITAL UNIVERSE · EST. 2026",
  title_plain: "Explore ",
  title_grad: "Beyond.",
  subtitle: "这里是 OUTAI 的数字空间。记录技术、探索 AI、收藏灵感，把想法变成现实。",
  buttons: [
    { label: "探索文章 ↗", href: "/blog/", style: "primary" },
    { label: "打开资源库 ⌁", href: "/collection/", style: "secondary" },
    { label: "进入宇宙 ☉", href: "#universe", style: "secondary" },
  ],
  tags: ["AI & TECHNOLOGY", "DIGITAL LIFE", "OPEN SOURCE", "BUILD IN PUBLIC"],
  terminal_command: "outai --about",
  terminal_output: "个人数字空间 — 记录技术、AI、互联网与工具，收藏有价值的链接。",
};

function normalizeButtons(raw: unknown): HeroButton[] {
  if (!Array.isArray(raw)) return DEFAULT_HERO.buttons;
  const out: HeroButton[] = [];
  for (const b of raw.slice(0, 4)) {
    if (b && typeof b === "object") {
      const rec = b as Record<string, unknown>;
      if (typeof rec.label === "string" && rec.label && typeof rec.href === "string" && rec.href) {
        out.push({ label: rec.label, href: rec.href, style: rec.style === "primary" ? "primary" : "secondary" });
      }
    }
  }
  return out.length ? out : DEFAULT_HERO.buttons;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return DEFAULT_HERO.tags;
  const tags = raw.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 8);
  return tags.length ? tags : DEFAULT_HERO.tags;
}

export async function getHeroContent(): Promise<HeroContent> {
  try {
    if (!supabase) return DEFAULT_HERO;
    const { data, error } = await supabase
      .from("hero_content")
      .select("eyebrow,title_plain,title_grad,subtitle,buttons,tags,terminal_command,terminal_output")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return DEFAULT_HERO;
    return {
      eyebrow: typeof data.eyebrow === "string" && data.eyebrow ? data.eyebrow : DEFAULT_HERO.eyebrow,
      title_plain: typeof data.title_plain === "string" ? data.title_plain : DEFAULT_HERO.title_plain,
      title_grad: typeof data.title_grad === "string" ? data.title_grad : DEFAULT_HERO.title_grad,
      subtitle: typeof data.subtitle === "string" ? data.subtitle : DEFAULT_HERO.subtitle,
      buttons: normalizeButtons(data.buttons),
      tags: normalizeTags(data.tags),
      terminal_command:
        typeof data.terminal_command === "string" && data.terminal_command
          ? data.terminal_command
          : DEFAULT_HERO.terminal_command,
      terminal_output:
        typeof data.terminal_output === "string" ? data.terminal_output : DEFAULT_HERO.terminal_output,
    };
  } catch {
    return DEFAULT_HERO;
  }
}
