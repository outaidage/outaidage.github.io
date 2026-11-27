// count-up.ts — 首页 SITE DATA 数字滚动：[data-count] 元素进入视口时
// 从 0 滚到目标值（easeOutCubic，约 1.1 秒）。服务端渲染的文本就是最终
// 值，所以无 JS / 减弱动效 / 不支持 IntersectionObserver 时数字依然
// 正确显示，不依赖这个脚本。减弱动效只认站内开关（dataset.motion），
// 与全站其他动效同一个原则。视图切换后 DOM 会被替换，需重新初始化，
// 返回的清理函数用来断开观察器。
export function initCountUp(): () => void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
  if (!els.length) return () => {};
  if (document.documentElement.dataset.motion === "reduced") return () => {};
  if (!("IntersectionObserver" in window)) return () => {};

  const run = (el: HTMLElement) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target) || target <= 0) return;
    const dur = 1100;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          run(en.target as HTMLElement);
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.4 }
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}
