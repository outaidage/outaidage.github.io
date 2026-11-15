// toolbox-tools.ts — 在线工具箱 3 个内置工具的元数据（后台可编辑名称/说明/排序/启用）。
// 工具逻辑仍在 src/components/Toolbox.tsx 里按 id（json / base64 / chars）实现，
// 后台只改元数据，不新增工具类型。构建时从 Supabase toolbox_tools 读取，
// 失败或缺失时回落内置默认值。改完后台需下次部署生效。
import { supabase } from "@/lib/supabase";

export type ToolboxToolMeta = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  enabled: boolean;
};

export const DEFAULT_TOOLS: ToolboxToolMeta[] = [
  { id: "json", name: "JSON 格式化", description: "验证并格式化 JSON，或压缩为单行。数据只在你的浏览器里处理。", sort_order: 10, enabled: true },
  { id: "base64", name: "Base64 编解码", description: "文本与 Base64 互转。点击结果可全选复制。", sort_order: 20, enabled: true },
  { id: "chars", name: "字数统计", description: "实时统计字符、单词、行数与段落。", sort_order: 30, enabled: true },
];

export async function getToolboxTools(): Promise<ToolboxToolMeta[]> {
  try {
    if (!supabase) return DEFAULT_TOOLS;
    const { data, error } = await supabase
      .from("toolbox_tools")
      .select("id,name,description,sort_order,enabled")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return DEFAULT_TOOLS;
    const known = new Set(DEFAULT_TOOLS.map((t) => t.id));
    const tools = (data as ToolboxToolMeta[])
      .filter((t) => known.has(t.id) && typeof t.name === "string" && t.name)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: typeof t.description === "string" ? t.description : "",
        sort_order: typeof t.sort_order === "number" ? t.sort_order : 0,
        enabled: true,
      }));
    return tools.length ? tools : DEFAULT_TOOLS;
  } catch {
    return DEFAULT_TOOLS;
  }
}
