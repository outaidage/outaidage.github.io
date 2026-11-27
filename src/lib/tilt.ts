// tilt.ts — lightweight 3D tilt for [data-tilt] cards (DIGITAL UNIVERSE 2.0).
// Pointer-driven rotateX/rotateY + a subtle glow shift. No dependency.
// Disabled when motion is reduced or on coarse (touch) pointers.
// Returns a cleanup function; re-run after each Astro view-transition
// navigation because the card DOM is replaced.
export function initTilt(): () => void {
  // No stored preference means tilt is ON; only explicit "reduced" disables it.
  const reduced = document.documentElement.dataset.motion === "reduced";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (reduced || coarse) return () => {};

  const cleanups: Array<() => void> = [];
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-tilt]"));
  for (const el of cards) {
    const onMove = (e: PointerEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / Math.max(r.width, 1) - 0.5;
      const py = (e.clientY - r.top) / Math.max(r.height, 1) - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateY(-3px)`;
      el.style.borderColor = "rgba(97, 237, 255, 0.45)";
      // 高光跟随：把指针位置写进 CSS 变量，卡片的 ::before 径向光斑
      // （global.css .card::before）就跟着指针走。
      el.style.setProperty("--mx", `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${((py + 0.5) * 100).toFixed(1)}%`);
    };
    const onLeave = () => {
      el.style.transform = "";
      el.style.borderColor = "";
      el.style.removeProperty("--mx");
      el.style.removeProperty("--my");
    };
    // Listen to both pointermove and mousemove: some environments dispatch
    // only one of them for synthetic or touch-driven cursors.
    el.addEventListener("pointermove", onMove);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("mouseleave", onLeave);
    cleanups.push(() => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("mouseleave", onLeave);
    });
  }
  return () => {
    for (const fn of cleanups) fn();
  };
}
