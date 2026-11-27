// cursor-fx.ts — 光标星尘拖尾 + 点击涟漪（视觉升级第三批）。
// 单张全屏 Canvas（pointer-events:none，永远不拦截点击）：指针移动时
// 撒下带辉光的小星尘（青/紫/绿三色），点击时扩散一圈涟漪。
// 只在细指针设备（桌面）启动；触摸设备不启动。减弱动效只认站内开关
// （dataset.motion），与全站原则一致。粒子有上限，无粒子时停掉 rAF，
// 不给低配机添负担。视图切换后需重新初始化，返回清理函数。
type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
};
type Ripple = { x: number; y: number; r: number; alpha: number };

const COLORS = ["97,237,255", "166,138,255", "125,255,206"];
const MAX_PARTICLES = 90;

export function initCursorFx(): () => void {
  if (document.documentElement.dataset.motion === "reduced") return () => {};
  if (window.matchMedia("(pointer: coarse)").matches) return () => {};

  const canvas = document.createElement("canvas");
  canvas.id = "cursor-fx";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;z-index:90;pointer-events:none";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  let w = 0;
  let h = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const particles: Particle[] = [];
  const ripples: Ripple[] = [];
  let raf = 0;
  let running = false;
  let lastSpawn = 0;

  const loop = () => {
    ctx.clearRect(0, 0, w, h);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy = p.vy * 0.98 + 0.008;
      const t = 1 - p.life / p.maxLife;
      if (t <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t + 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color},${(t * 0.85).toFixed(3)})`;
      ctx.shadowColor = `rgba(${p.color},0.8)`;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.r += 2.6;
      r.alpha -= 0.016;
      if (r.alpha <= 0) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(97,237,255,${r.alpha.toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (particles.length || ripples.length) {
      raf = requestAnimationFrame(loop);
    } else {
      running = false;
      ctx.clearRect(0, 0, w, h);
    }
  };
  const kick = () => {
    if (!running) {
      running = true;
      raf = requestAnimationFrame(loop);
    }
  };

  const onMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - lastSpawn < 24) return; // 节流：约每 24ms 撒一颗
    lastSpawn = now;
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
    particles.push({
      x: e.clientX + (Math.random() * 10 - 5),
      y: e.clientY + (Math.random() * 10 - 5),
      vx: (Math.random() - 0.5) * 0.5,
      vy: Math.random() * 0.5 + 0.15,
      life: 0,
      maxLife: 46 + Math.random() * 30,
      size: 1 + Math.random() * 1.6,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    });
    kick();
  };
  const onDown = (e: PointerEvent) => {
    ripples.push({ x: e.clientX, y: e.clientY, r: 2, alpha: 0.55 });
    kick();
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("resize", resize);

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("resize", resize);
    cancelAnimationFrame(raf);
    running = false;
    canvas.remove();
  };
}
