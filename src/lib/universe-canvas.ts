// universe-canvas.ts — OUTAI digital universe background (2D canvas particle field).
// Zero dependencies. Written for OUTAI; the approach is inspired by the particle
// backgrounds in React Bits / Magic UI, but this is an original implementation
// tuned to the OUTAI brand green (#B5F36B).
//
// Behaviour:
// - Desktop up to 120 particles, mobile / coarse pointer up to 40.
// - Slow drift + gentle twinkle + mouse parallax (lerped, max ~12px offset).
// - Faint connection lines only between nearby particles.
// - rAF pauses when the canvas leaves the viewport (IntersectionObserver),
//   when the tab is hidden (visibilitychange), and when motion is reduced
//   (prefers-reduced-motion or documentElement.dataset.motion === "reduced").
// - devicePixelRatio capped at 1.5.

export interface UniverseOptions {
  particleCountDesktop?: number;
  particleCountMobile?: number;
  color?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  depth: number; // 0..1 — parallax depth (far particles move less)
}

const BRAND = "#b5f36b";

function motionReduced(): boolean {
  if (document.documentElement.dataset.motion === "reduced") return true;
  if (document.documentElement.dataset.motion === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function initUniverse(canvas: HTMLCanvasElement, opts: UniverseOptions = {}): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const color = opts.color ?? BRAND;
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  const isSmall = window.innerWidth < 760;
  const targetCount = isCoarse || isSmall
    ? (opts.particleCountMobile ?? 40)
    : (opts.particleCountDesktop ?? 120);

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let w = 0;
  let h = 0;
  let particles: Particle[] = [];
  let raf = 0;
  let running = false;
  let visible = true;
  let mouseX = 0.5;
  let mouseY = 0.5;
  let px = 0.5; // smoothed parallax
  let py = 0.5;
  let last = 0;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    particles = Array.from({ length: targetCount }, () => {
      const depth = 0.25 + Math.random() * 0.75;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12 * depth,
        vy: (Math.random() - 0.5) * 0.1 * depth,
        r: 0.6 + Math.random() * 1.6 * depth,
        baseAlpha: 0.25 + Math.random() * 0.55,
        twinkleSpeed: 0.4 + Math.random() * 1.2,
        twinklePhase: Math.random() * Math.PI * 2,
        depth,
      };
    });
  }

  function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const [cr, cg, cb] = hexToRgb(color);

  function step(t: number) {
    if (!running) return;
    const dt = Math.min((t - last) / 16.7, 3) || 1;
    last = t;

    // Smooth mouse parallax toward the pointer.
    px += (mouseX - px) * 0.04;
    py += (mouseY - py) * 0.04;
    const ox = (px - 0.5) * 24;
    const oy = (py - 0.5) * 24;

    ctx.clearRect(0, 0, w, h);

    // Connection lines (nearby particles only, faint).
    const linkDist = 110;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.08;
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x + ox * a.depth, a.y + oy * a.depth);
          ctx.lineTo(b.x + ox * b.depth, b.y + oy * b.depth);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;
      const twinkle = 0.7 + 0.3 * Math.sin(t / 1000 * p.twinkleSpeed + p.twinklePhase);
      const alpha = Math.min(1, p.baseAlpha * twinkle);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x + ox * p.depth, p.y + oy * p.depth, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    raf = requestAnimationFrame(step);
  }

  function start() {
    if (running || motionReduced() || !visible) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ctx.clearRect(0, 0, w, h);
  }

  function onMouse(e: PointerEvent) {
    mouseX = e.clientX / window.innerWidth;
    mouseY = e.clientY / window.innerHeight;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) start();
    else stop();
  }, { threshold: 0 });
  io.observe(canvas);

  const mo = new MutationObserver(() => {
    if (motionReduced()) stop();
    else start();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onMouse, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);

  resize();
  start();

  return () => {
    stop();
    io.disconnect();
    mo.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onMouse);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
