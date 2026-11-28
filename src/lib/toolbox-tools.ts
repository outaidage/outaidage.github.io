// toolbox-tools.ts — 在线工具箱内置工具的元数据（后台可编辑名称/说明/排序/启用）。
// 工具逻辑在 src/components/Toolbox.tsx 里按 id 实现（json / base64 / chars /
// jwt / timestamp）。合并规则：代码里的 DEFAULT_TOOLS 是全集，后台
// toolbox_tools 的同 id 行覆盖名称/说明/排序/启用；后台没有行 = 用默认值
// 显示。这样新增内置工具不用先往数据库塞行也能上线，后台随后可调。
// 构建时读取，改完后台需下次部署生效。
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
  { id: "jwt", name: "JWT 解析", description: "解析 JSON Web Token 的 Header 与 Payload，查看过期时间。只在本地解码，不验证签名。", sort_order: 40, enabled: true },
  { id: "timestamp", name: "时间戳转换", description: "Unix 时间戳（秒/毫秒）与日期时间互转，含当前时间戳。", sort_order: 50, enabled: true },
];

export async function getToolboxTools(): Promise<ToolboxToolMeta[]> {
  try {
    if (!supabase) return DEFAULT_TOOLS;
    const { data, error } = await supabase
      .from("toolbox_tools")
      .select("id,name,description,sort_order,enabled");
    if (error || !data) return DEFAULT_TOOLS;
    const byId = new Map((data as ToolboxToolMeta[]).map((t) => [t.id, t]));
    return DEFAULT_TOOLS.map((d) => {
      const row = byId.get(d.id);
      if (!row) return d;
      return {
        id: d.id,
        name: typeof row.name === "string" && row.name ? row.name : d.name,
        description: typeof row.description === "string" ? row.description : d.description,
        sort_order: typeof row.sort_order === "number" ? row.sort_order : d.sort_order,
        enabled: row.enabled !== false,
      };
    })
      .filter((t) => t.enabled)
      .sort((a, b) => a.sort_order - b.sort_order);
  } catch {
    return DEFAULT_TOOLS;
  }
}
