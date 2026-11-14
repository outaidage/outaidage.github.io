// wormhole.ts — DIGITAL UNIVERSE 2.0 wormhole page transition.
// Shows a GSAP energy-burst overlay during Astro client-side navigation.
// It hooks Astro's own navigation lifecycle instead of intercepting clicks,
// so it never fights the router and never blocks routing:
//   astro:before-preparation → flash in (the navigation is starting)
//   astro:page-load          → flash out (the new page is ready)
// Skips entirely when motion is reduced. If GSAP fails, nothing breaks —
// the overlay simply never appears and navigation proceeds normally.
import gsap from "gsap";

function motionReduced(): boolean {
  if (document.documentElement.dataset.motion === "reduced") return true;
  if (document.documentElement.dataset.motion === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function initWormhole(): () => void {
  // Overlay: a radial warp burst centred on the viewport. Created once.
  let overlay = document.getElementById("wormhole-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "wormhole-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:300", "pointer-events:none",
      "opacity:0",
      "background:radial-gradient(circle at 50% 42%, rgba(97,237,255,0.55) 0%, rgba(166,138,255,0.30) 20%, rgba(3,4,11,0.85) 58%, rgba(3,4,11,0.96) 100%)",
    ].join(";");
    document.body.appendChild(overlay);
  }

  const flashIn = () => {
    if (motionReduced()) return;
    gsap.killTweensOf(overlay);
    gsap.fromTo(
      overlay,
      { opacity: 0, scale: 1 },
      { opacity: 1, scale: 1.1, duration: 0.28, ease: "power2.in" },
    );
  };
  const flashOut = () => {
    gsap.killTweensOf(overlay);
    gsap.to(overlay, { opacity: 0, scale: 1, duration: 0.35, ease: "power2.out" });
  };

  document.addEventListener("astro:before-preparation", flashIn);
  document.addEventListener("astro:page-load", flashOut);

  return () => {
    document.removeEventListener("astro:before-preparation", flashIn);
    document.removeEventListener("astro:page-load", flashOut);
    overlay?.remove();
  };
}
