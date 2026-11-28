// stamp-sw.mjs — 构建后给 dist/sw.js 的缓存名盖上本次构建的唯一标记，
// 让每次部署都换一个新的 Service Worker 缓存名：activate 时旧缓存会被
// 全量删除，用户设备不再长期吃旧版缓存的 CSS/图片。非致命：找不到
// 标记时只警告（sw.js 会以字面名运行，功能不受影响）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const file = new URL("../dist/sw.js", import.meta.url);
if (!existsSync(file)) {
  console.warn("[stamp-sw] dist/sw.js 不存在，跳过");
  process.exit(0);
}
const src = readFileSync(file, "utf8");
if (!src.includes("outai-__BUILD__")) {
  console.warn("[stamp-sw] 未找到 __BUILD__ 标记，跳过（缓存名保持不变）");
  process.exit(0);
}
const stamp = `outai-${Date.now().toString(36)}`;
writeFileSync(file, src.replaceAll("outai-__BUILD__", stamp));
console.log(`[stamp-sw] 缓存名已标记为 ${stamp}`);
