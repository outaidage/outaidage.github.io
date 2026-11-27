// sw.js — OUTAI 离线缓存（PWA）。
// 策略：带哈希的静态资源与图片 = 缓存优先（内容不变，放心缓存）；
// 页面与其它请求 = 网络优先（内容永远新鲜），失败时回退缓存，
// 离线也能打开最近看过的页面。跨域请求（Supabase / R2 视频等）
// 一律不碰。改版时把 CACHE 版本号 +1 即可全量刷新。
const CACHE = "outai-v1";
const CORE = ["/favicon.svg", "/manifest.webmanifest", "/og.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  const isAsset =
    url.pathname.startsWith("/_astro/") ||
    url.pathname.startsWith("/textures/") ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname);
  if (isAsset) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            return res;
          })
      )
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
