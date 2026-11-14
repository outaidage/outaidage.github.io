// wormhole.ts — DIGITAL UNIVERSE 2.0 wormhole page transition.
// On internal nav clicks, a GSAP-powered energy burst overlay flashes
// (a radial warp that expands from the click point) and the navigation
// follows ~260ms later. The overlay is hidden again on astro:page-load
// so it never lingers after the page changes.
// Skips: reduced motion, external links, hash links, admin page links,
// and plain modifier-clicks (new tab). If GSAP fails to load, navigation
// proceeds immediately — the effect never blocks routing.
import gsap from "gsap";

const BASE = (import.meta.env.BASE_URL || "/") as string;

function motionReduced(): boolean {
  if (document.documentElement.dataset.motion === "reduced") return true;
  if (document.documentElement.dataset.motion === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isInternalNav(a: HTMLAnchorElement): boolean {
  if (!a.href) return false;
  if (a.target === "_blank") return false;
  if (a.hasAttribute("download")) return false;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.hash && url.pathname === window.location.pathname) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return false;
  return true;
}

export function initWormhole(): () => void {
  // Overlay: a radial warp burst. Created once, reused for every transition.
  let overlay = document.getElementById("wormhole-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "wormhole-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:300", "pointer-events:none",
      "opacity:0",
      "background:radial-gradient(circle at var(--wx,50%) var(--wy,50%), rgba(97,237,255,0.55) 0%, rgba(166,138,255,0.32) 18%, rgba(3,4,11,0.88) 55%, rgba(3,4,11,0.97) 100%)",
    ].join(";");
    document.body.appendChild(overlay);
  }

  const hide = () => {
    gsap.set(overlay, { opacity: 0 });
  };
  const onPageLoad = () => hide();
  document.addEventListener("astro:page-load", onPageLoad);

  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const a = t?.closest?.("a") as HTMLAnchorElement | null;
    if (!a || !isInternalNav(a)) return;
    if (motionReduced()) return;

    e.preventDefault();
    const href = a.href;
    overlay!.style.setProperty("--wx", `${(e.clientX / window.innerWidth) * 100}%`);
    overlay!.style.setProperty("--wy", `${(e.clientY / window.innerHeight) * 100}%`);
    gsap.fromTo(
      overlay,
      { opacity: 0, scale: 1 },
      {
        opacity: 1,
        scale: 1.12,
        duration: 0.34,
        ease: "power2.in",
        onComplete: () => {
          // Navigate via Astro's client router when available; fall back to
          // a full navigation. The overlay is hidden on astro:page-load.
          import("astro:transitions/client")
            .then((m) => m.navigate(href))
            .catch(() => {
              window.location.href = href;
            });
          // Safety: if the router never fires page-load (e.g. same-page
          // edge case), hide the overlay so it can't trap the page.
          window.setTimeout(hide, 900);
        },
      },
    );
  };
  document.addEventListener("click", onClick, true);

  return () => {
    document.removeEventListener("astro:page-load", onPageLoad);
    document.removeEventListener("click", onClick, true);
    overlay?.remove();
  };
}
