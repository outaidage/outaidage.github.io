// wormhole.ts — DIGITAL UNIVERSE 虫洞页面切换转场。
// 在 Astro 客户端导航的生命周期上挂一个能量隧道遮罩：
//   astro:before-preparation → 隧道张开（同心环扩散 + 锥形光旋转 + 中心辉光）
//   astro:page-load          → 隧道收拢淡出（新页面已就绪）
// 只钩事件、不拦截点击，所以永不和路由器打架、永不阻塞导航。
// 减弱动效（站内开关）时完全跳过。GSAP 失败时遮罩不出现，导航照常。
// 2 秒安全兜底：新页面迟迟未就绪时强制淡出，遮罩绝不久留盖屏。
import gsap from "gsap";

function motionReduced(): boolean {
  // 与全站一致：只认站内动效开关（dataset.motion），不认操作系统设置。
  return document.documentElement.dataset.motion === "reduced";
}

export function initWormhole(): () => void {
  // 遮罩：中心辉光底 + 同心环层 + 锥形光旋转层，创建一次后复用。
  let overlay = document.getElementById("wormhole-overlay");
  let rings: HTMLElement | null = null;
  let swirl: HTMLElement | null = null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "wormhole-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:300", "pointer-events:none",
      "opacity:0", "overflow:hidden",
      "background:radial-gradient(circle at 50% 42%, rgba(97,237,255,0.55) 0%, rgba(166,138,255,0.30) 20%, rgba(3,4,11,0.85) 58%, rgba(3,4,11,0.96) 100%)",
    ].join(";");
    rings = document.createElement("div");
    rings.style.cssText = [
      "position:absolute", "inset:-40%",
      "background:repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 52px, rgba(97,237,255,0.16) 52px, rgba(97,237,255,0.16) 54px, transparent 54px, transparent 108px)",
      "opacity:0",
    ].join(";");
    swirl = document.createElement("div");
    swirl.style.cssText = [
      "position:absolute", "inset:-40%",
      "background:conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(166,138,255,0.13) 50deg, transparent 110deg, rgba(97,237,255,0.10) 190deg, transparent 260deg, rgba(125,255,206,0.07) 320deg, transparent 360deg)",
      "opacity:0",
    ].join(";");
    overlay.appendChild(swirl);
    overlay.appendChild(rings);
    document.body.appendChild(overlay);
  } else {
    rings = overlay.children[1] as HTMLElement | null;
    swirl = overlay.children[0] as HTMLElement | null;
  }

  // 转场遮罩 2 秒兜底定时器（见 flashIn）。
  let safetyTimer = 0;

  const killAll = () => {
    gsap.killTweensOf(overlay);
    if (rings) gsap.killTweensOf(rings);
    if (swirl) gsap.killTweensOf(swirl);
  };

  const flashIn = () => {
    if (motionReduced()) return;
    killAll();
    gsap.fromTo(
      overlay,
      { opacity: 0, scale: 1 },
      { opacity: 1, scale: 1.08, duration: 0.32, ease: "power2.in" },
    );
    if (rings) {
      gsap.fromTo(
        rings,
        { opacity: 0, scale: 0.55 },
        { opacity: 1, scale: 1.35, duration: 0.38, ease: "power2.in" },
      );
    }
    if (swirl) {
      gsap.fromTo(
        swirl,
        { opacity: 0, rotation: 0 },
        { opacity: 1, rotation: 130, duration: 0.45, ease: "power2.in" },
      );
    }
    // 安全兜底：如果新页面 2 秒内没有加载完成（page-load 未触发），强制淡出，
    // 绝不让转场遮罩一直盖住屏幕（慢网络下先显示旧页面，等新页面就绪）。
    window.clearTimeout(safetyTimer);
    safetyTimer = window.setTimeout(() => {
      killAll();
      gsap.to(overlay, { opacity: 0, duration: 0.3 });
      if (rings) gsap.to(rings, { opacity: 0, duration: 0.3 });
      if (swirl) gsap.to(swirl, { opacity: 0, duration: 0.3 });
    }, 2000);
  };
  const flashOut = () => {
    window.clearTimeout(safetyTimer);
    killAll();
    gsap.to(overlay, { opacity: 0, scale: 1, duration: 0.4, ease: "power2.out" });
    if (rings) {
      gsap.to(rings, { opacity: 0, scale: 1.8, duration: 0.45, ease: "power2.out" });
    }
    if (swirl) {
      gsap.to(swirl, { opacity: 0, rotation: "+=70", duration: 0.45, ease: "power2.out" });
    }
  };

  document.addEventListener("astro:before-preparation", flashIn);
  document.addEventListener("astro:page-load", flashOut);

  return () => {
    document.removeEventListener("astro:before-preparation", flashIn);
    document.removeEventListener("astro:page-load", flashOut);
    window.clearTimeout(safetyTimer);
    overlay?.remove();
  };
}
