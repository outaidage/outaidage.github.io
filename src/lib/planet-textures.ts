// planet-textures.ts — 程序化行星纹理（Canvas 生成，零外部依赖）。
// 用于没有现成公开贴图的五颗行星：水星 / 金星 / 火星 / 木星 / 土星，
// 以及土星环。每一张都按该行星的真实特征绘制（陨石坑、云层漩涡、
// 红色地貌、条纹+大红斑、淡色条纹），不是纯色球。
// 天王星 / 海王星用 Solar System Scope 2K 真实贴图（CC BY 4.0），
// 地球用 NASA Visible Earth 真实贴图，太阳用 GLSL Shader。

import * as THREE from "three";

/** 确定性随机数（同一颗行星每次加载的纹理相同）。 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  return [c, ctx];
}

/** 柔和噪点：大量半透明小圆，压低画面"塑料感"。 */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, n: number, colors: string[], alpha: [number, number], rMax: number) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = 1 + rand() * rMax;
    ctx.globalAlpha = alpha[0] + rand() * (alpha[1] - alpha[0]);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintMercury(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) {
  ctx.fillStyle = "#8d857a"; ctx.fillRect(0, 0, w, h);
  // 大尺度明暗斑块
  speckle(ctx, w, h, rand, 260, ["#7d756a", "#9a9284", "#6e675e", "#a39a8b"], [0.05, 0.16], 60);
  // 陨石坑：暗环 + 亮心
  for (let i = 0; i < 340; i++) {
    const x = rand() * w, y = rand() * h, r = 1.5 + rand() * rand() * 16;
    ctx.globalAlpha = 0.25 + rand() * 0.25;
    ctx.strokeStyle = "#5e574e"; ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.18 + rand() * 0.2; ctx.fillStyle = "#b0a897";
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, w, h, rand, 1200, ["#6e675e", "#a39a8b"], [0.04, 0.12], 3);
}

function paintVenus(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) {
  ctx.fillStyle = "#d9b96a"; ctx.fillRect(0, 0, w, h);
  // 横向云带（正弦扰动的柔和条纹）
  for (let y = 0; y < h; y += 6) {
    const t = y / h;
    const shade = 0.5 + 0.5 * Math.sin(t * Math.PI * 7 + Math.sin(t * 22) * 0.8);
    ctx.globalAlpha = 0.05 + shade * 0.1;
    ctx.fillStyle = shade > 0.5 ? "#f0dca0" : "#b8934a";
    ctx.fillRect(0, y, w, 6);
  }
  // 大尺度漩涡：旋转椭圆
  for (let i = 0; i < 60; i++) {
    const x = rand() * w, y = rand() * h, rx = 40 + rand() * 160, ry = 8 + rand() * 26;
    const rot = (rand() - 0.5) * 0.9;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    const col = rand() > 0.5 ? "240,220,160" : "168,140,74";
    g.addColorStop(0, `rgba(${col},${0.10 + rand() * 0.12})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function paintMars(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) {
  ctx.fillStyle = "#b5533c"; ctx.fillRect(0, 0, w, h);
  // 深色海区（不规则斑块）
  for (let i = 0; i < 90; i++) {
    const x = rand() * w, y = h * 0.15 + rand() * h * 0.7, rx = 20 + rand() * 110, ry = 8 + rand() * 30;
    ctx.globalAlpha = 0.10 + rand() * 0.18; ctx.fillStyle = "#7a2f22";
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, (rand() - 0.5) * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  // 浅色尘埃区
  speckle(ctx, w, h, rand, 220, ["#d98a68", "#c96a48", "#a34a34"], [0.06, 0.16], 46);
  // 极冠（上下边缘柔和白色）
  for (const top of [true, false]) {
    const g = ctx.createLinearGradient(0, top ? 0 : h, 0, top ? 34 : h - 34);
    g.addColorStop(0, "rgba(245,240,230,0.95)");
    g.addColorStop(1, "rgba(245,240,230,0)");
    ctx.globalAlpha = 1; ctx.fillStyle = g;
    ctx.fillRect(0, top ? 0 : h - 34, w, 34);
  }
  speckle(ctx, w, h, rand, 900, ["#8a3a2a", "#c96a48"], [0.04, 0.1], 3);
}

function paintJupiter(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) {
  // 大气条纹（正弦扰动的水平带）
  const bands = ["#e8d0a8", "#c8a06a", "#f0e8d8", "#a87c4f", "#e0c69a", "#b98d5e", "#efe0c0"];
  let y = 0, bi = 0;
  while (y < h) {
    const bh = 18 + rand() * 42;
    ctx.fillStyle = bands[bi % bands.length];
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.01 + bi * 1.7) * 5 + Math.sin(x * 0.037 + bi) * 2);
    }
    ctx.lineTo(w, y + bh); ctx.lineTo(0, y + bh); ctx.closePath(); ctx.fill();
    y += bh; bi++;
  }
  ctx.globalAlpha = 1;
  // 湍流细纹
  for (let i = 0; i < 260; i++) {
    const x = rand() * w, yy = rand() * h, len = 20 + rand() * 120;
    ctx.globalAlpha = 0.06 + rand() * 0.1;
    ctx.strokeStyle = rand() > 0.5 ? "#8a6a45" : "#f5ecd6";
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath(); ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + len * 0.3, yy + (rand() - 0.5) * 6, x + len * 0.7, yy + (rand() - 0.5) * 6, x + len, yy + (rand() - 0.5) * 4);
    ctx.stroke();
  }
  // 大红斑（南半球约 60% 高度处）
  const sx = w * 0.62, sy = h * 0.62;
  ctx.globalAlpha = 0.9; ctx.fillStyle = "#c65a3a";
  ctx.beginPath(); ctx.ellipse(sx, sy, 74, 30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.strokeStyle = "#e8a080"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(sx, sy, 82, 36, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.65; ctx.fillStyle = "#d97a52";
  ctx.beginPath(); ctx.ellipse(sx, sy, 52, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function paintSaturn(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) {
  const bands = ["#e8dcbb", "#d9c69a", "#efe3c2", "#c9b183", "#e2d2a8", "#cdb98e"];
  let y = 0, bi = 0;
  while (y < h) {
    const bh = 22 + rand() * 46;
    ctx.fillStyle = bands[bi % bands.length];
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.008 + bi * 2.1) * 3);
    ctx.lineTo(w, y + bh); ctx.lineTo(0, y + bh); ctx.closePath(); ctx.fill();
    y += bh; bi++;
  }
  ctx.globalAlpha = 1;
  speckle(ctx, w, h, rand, 200, ["#b8a67e", "#efe3c2"], [0.05, 0.1], 30);
}

/** 土星环纹理：RingGeometry 的 V 轴 = 半径方向，横向条纹表示环缝。 */
function makeSaturnRingTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 512);
  const rand = mulberry32(99);
  ctx.clearRect(0, 0, 64, 512);
  // 卡西尼环缝附近留出透明带
  const bands: [number, number, string, number][] = [
    [0, 0.18, "#cbb98e", 0.55], [0.18, 0.30, "#e8dcbb", 0.9], [0.30, 0.38, "#b8a67e", 0.4],
    [0.38, 0.52, "#e2d2a8", 0.95], [0.52, 0.60, "#8a7a5c", 0.12], [0.60, 0.78, "#d9c69a", 0.85],
    [0.78, 0.90, "#c9b183", 0.6], [0.90, 1.0, "#e8dcbb", 0.35],
  ];
  for (const [v0, v1, col, a] of bands) {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.fillRect(0, v0 * 512, 64, (v1 - v0) * 512);
  }
  // 细环纹
  for (let i = 0; i < 160; i++) {
    ctx.globalAlpha = 0.05 + rand() * 0.12;
    ctx.fillStyle = rand() > 0.5 ? "#ffffff" : "#6e6046";
    ctx.fillRect(0, rand() * 512, 64, 1 + rand() * 2);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const PAINTERS: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) => void> = {
  mercury: paintMercury,
  venus: paintVenus,
  mars: paintMars,
  jupiter: paintJupiter,
  saturn: paintSaturn,
};

const SEEDS: Record<string, number> = { mercury: 11, venus: 22, mars: 33, jupiter: 44, saturn: 55 };

const cache = new Map<string, THREE.CanvasTexture>();

/** 取一颗程序化行星的纹理（带缓存）。key: mercury | venus | mars | jupiter | saturn */
export function getProceduralTexture(key: string): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const painter = PAINTERS[key];
  if (!painter) throw new Error(`unknown procedural planet texture: ${key}`);
  const [c, ctx] = makeCanvas(1024, 512);
  painter(ctx, 1024, 512, mulberry32(SEEDS[key] ?? 7));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

let ringTex: THREE.CanvasTexture | null = null;
export function getSaturnRingTexture(): THREE.CanvasTexture {
  if (!ringTex) ringTex = makeSaturnRingTexture();
  return ringTex;
}
