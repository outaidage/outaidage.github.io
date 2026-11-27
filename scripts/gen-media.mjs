// 构建时生成媒体（prebuild 自动运行，也可 npm run gen:media 手动跑）：
//  1. PWA 图标 PNG（public/icons/）：内联 SVG 标记 → sharp 栅格化；
//  2. 每篇文章的 OG 分享图（public/og/<slug>.png，1200×630）：
//     深空底 + 星点 + 文章标题（Noto Sans SC，见 scripts/fonts.conf）。
// 单张失败只警告不中断构建；文章页会检测 PNG 是否存在，缺失时回退默认 og.png。
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONT = "Noto Sans SC";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 由种子生成确定性伪随机星点（同一 slug 每次构建结果一致）。 */
function stars(seed, n, w, h, maxR = 1.8) {
  let s = 2166136261;
  for (const ch of seed) { s ^= ch.codePointAt(0); s = Math.imul(s, 16777619); }
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (rnd() * w).toFixed(1), y = (rnd() * h).toFixed(1);
    const r = (0.5 + rnd() * maxR).toFixed(1), o = (0.25 + rnd() * 0.6).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#cfe9ff" opacity="${o}"/>`;
  }
  return out;
}

/* ---------------- 图标 ---------------- */
function iconSvg(maskable) {
  const scale = maskable ? 0.78 : 1;
  const bg = maskable
    ? `<rect width="512" height="512" fill="url(#bg)"/>`
    : `<rect width="512" height="512" rx="104" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141438"/><stop offset="1" stop-color="#03040B"/>
    </linearGradient>
    <linearGradient id="pl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#61EDFF"/><stop offset="1" stop-color="#A68AFF"/>
    </linearGradient>
  </defs>
  ${bg}
  ${stars("outai-icon", 26, 512, 512, 2)}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <ellipse cx="256" cy="256" rx="196" ry="74" fill="none" stroke="#61EDFF" stroke-width="13" opacity="0.9" transform="rotate(-18 256 256)"/>
    <circle cx="256" cy="256" r="62" fill="url(#pl)"/>
    <circle cx="404" cy="196" r="17" fill="#7DFFCE"/>
  </g>
</svg>`;
}

async function genIcons() {
  const dir = join(root, "public", "icons");
  mkdirSync(dir, { recursive: true });
  const jobs = [
    ["icon-512.png", 512, false], ["icon-192.png", 192, false],
    ["apple-touch-icon.png", 180, false], ["maskable-512.png", 512, true],
  ];
  for (const [name, size, maskable] of jobs) {
    await sharp(Buffer.from(iconSvg(maskable))).resize(size, size).png().toFile(join(dir, name));
    console.log(`[gen-media] icon ${name}`);
  }
}

/* ---------------- OG 图 ---------------- */
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = {};
  if (!m) return fm;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return fm;
}

/** 近似排版：CJK/全角 = 1em，ASCII = 0.55em；按最大 em 宽折行。 */
function wrapTitle(title, maxEm = 14.5, maxLines = 3) {
  const lines = [];
  let cur = "", w = 0;
  for (const ch of title) {
    const cw = /[\x00-\xff]/.test(ch) ? 0.55 : 1;
    if (w + cw > maxEm && cur) { lines.push(cur); cur = ""; w = 0; if (lines.length === maxLines) break; }
    cur += ch; w += cw;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const joined = lines.join("");
    if (joined.length < title.length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, "…");
  }
  return lines;
}

function ogSvg({ title, date, category, slug }) {
  const lines = wrapTitle(title);
  const fs = lines.some((l) => l.length > 12) ? 58 : 66;
  const lh = Math.round(fs * 1.32);
  const startY = 308 - ((lines.length - 1) * lh) / 2;
  const tspans = lines.map((l, i) =>
    `<text x="84" y="${startY + i * lh}" font-family="${FONT}" font-weight="900" font-size="${fs}" fill="#F2F7FF">${esc(l)}</text>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10102B"/><stop offset="1" stop-color="#03040B"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#A68AFF" stop-opacity="0.34"/><stop offset="1" stop-color="#A68AFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="pl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#61EDFF"/><stop offset="1" stop-color="#A68AFF"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1090" cy="60" r="330" fill="url(#glow)"/>
  ${stars(slug, 70, 1200, 630)}
  <g opacity="0.85">
    <ellipse cx="1022" cy="428" rx="238" ry="88" fill="none" stroke="#61EDFF" stroke-width="5" opacity="0.55" transform="rotate(-18 1022 428)"/>
    <circle cx="1022" cy="428" r="66" fill="url(#pl)" opacity="0.9"/>
    <circle cx="1170" cy="368" r="13" fill="#7DFFCE"/>
  </g>
  <text x="84" y="118" font-family="${FONT}" font-weight="700" font-size="34" letter-spacing="10" fill="#61EDFF">OUTAI</text>
  <rect x="86" y="140" width="72" height="4" fill="#61EDFF"/>
  ${tspans}
  <rect x="86" y="512" width="1030" height="1.5" fill="#61EDFF" opacity="0.35"/>
  <text x="84" y="562" font-family="${FONT}" font-size="26" fill="#9FB3C8">${esc(date)}${category ? `  ·  ${esc(category)}` : ""}</text>
  <text x="1116" y="562" text-anchor="end" font-family="${FONT}" font-size="26" fill="#9FB3C8">outaidage.xyz</text>
</svg>`;
}

async function genOg() {
  const blogDir = join(root, "src", "content", "blog");
  const outDir = join(root, "public", "og");
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(blogDir).filter((f) => f.endsWith(".md"))) {
    const slug = file.replace(/\.md$/, "");
    try {
      const fm = parseFrontmatter(readFileSync(join(blogDir, file), "utf8"));
      const svg = ogSvg({
        title: fm.title || slug,
        date: (fm.pubDate || "").slice(0, 10),
        category: fm.category || "",
        slug,
      });
      await sharp(Buffer.from(svg)).png().toFile(join(outDir, `${slug}.png`));
      console.log(`[gen-media] og ${slug}.png`);
    } catch (e) {
      console.warn(`[gen-media] og ${slug} 生成失败（文章页将回退默认图）：${e.message}`);
    }
  }
}

// 生成失败不阻断站点构建（图标/OG 缺失时页面有回退）；错误会醒目打印，
// 部署后由线上验收确认文件确实生成。
try {
  await genIcons();
} catch (e) {
  console.error(`[gen-media] 图标生成失败：${e.message}`);
}
await genOg();
console.log("[gen-media] done");
