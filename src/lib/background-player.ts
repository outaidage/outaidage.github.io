// background-player.ts — Background Studio 播放器逻辑（资源 + 轮换 + 喜欢/收藏）。
// 与 video-scenes.ts（旧的视频场景配置）并存：有背景资源时优先用资源库，
// 没有时回退 video_scenes，再回退静态渐变。
import { supabase } from "@/lib/supabase";

export type BackgroundAsset = {
  id: string;
  title: string;
  description: string;
  media_kind: "image" | "video";
  mime: string;
  url: string;
  thumbnail_url: string;
  category: string;
  tags: string[];
  source: string;
  source_url: string;
  author: string;
  license: string;
  attribution: string;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  status: string;
  enabled: boolean;
  is_featured: boolean;
};

export type RotationMode =
  | "manual"
  | "random_each_visit"
  | "timed"
  | "daily"
  | "favorites"
  | "category"
  | "source"
  | "collection";

export type RotationSettings = {
  mode: RotationMode;
  interval_minutes: number;
  category: string | null;
  source_id: string | null;
  collection: string | null;
  pinned_asset_id: string | null;
};

export const DEFAULT_ROTATION: RotationSettings = {
  mode: "manual",
  interval_minutes: 30,
  category: null,
  source_id: null,
  collection: null,
  pinned_asset_id: null,
};

// ---- 访客设备标识（localStorage 生成的 UUID，用于匿名喜欢/收藏） ----
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem("outai-device-id");
    if (!id) {
      id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("outai-device-id", id);
    }
    return id;
  } catch {
    return "dev-unknown";
  }
}

// ---- 喜欢/收藏（localStorage 本地镜像 + Supabase 写入） ----
export function getLocalLikes(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("outai-bg-likes") || "[]"));
  } catch {
    return new Set();
  }
}

export function getLocalFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem("outai-bg-favorites") || "[]");
  } catch {
    return [];
  }
}

function setLocalLikes(ids: Set<string>) {
  try {
    localStorage.setItem("outai-bg-likes", JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

function setLocalFavorites(ids: string[]) {
  try {
    localStorage.setItem("outai-bg-favorites", JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export async function toggleLike(assetId: string): Promise<boolean> {
  const likes = getLocalLikes();
  const liked = !likes.has(assetId);
  if (liked) likes.add(assetId);
  else likes.delete(assetId);
  setLocalLikes(likes);
  // 同步到 Supabase（匿名 device_id；登录用户走 user_id，由 RLS 与后端约束保证）。
  try {
    if (supabase) {
      if (liked) {
        await supabase.from("background_likes").insert({ asset_id: assetId, device_id: getDeviceId() });
      } else {
        await supabase.from("background_likes").delete().eq("asset_id", assetId).eq("device_id", getDeviceId());
      }
    }
  } catch {
    /* 本地状态已更新，服务端同步失败不影响本地体验 */
  }
  return liked;
}

export async function toggleFavorite(assetId: string, collection = "默认收藏"): Promise<boolean> {
  const favs = getLocalFavorites();
  const idx = favs.indexOf(assetId);
  const added = idx === -1;
  if (added) favs.push(assetId);
  else favs.splice(idx, 1);
  setLocalFavorites(favs);
  try {
    if (supabase) {
      if (added) {
        await supabase.from("background_favorites").insert({ asset_id: assetId, device_id: getDeviceId(), collection });
      } else {
        await supabase.from("background_favorites").delete().eq("asset_id", assetId).eq("device_id", getDeviceId());
      }
    }
  } catch {
    /* ignore */
  }
  return added;
}

// ---- 加载资源与轮换设置 ----
export async function loadBackgroundAssets(): Promise<BackgroundAsset[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("background_assets")
    .select("id,title,description,media_kind,mime,url,thumbnail_url,category,tags,source,source_url,author,license,attribution,file_size_bytes,width,height,duration_seconds,status,enabled,is_featured")
    .eq("status", "active")
    .eq("enabled", true)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  // 移动端优先 device=mobile/all，桌面优先 device=desktop/all。
  const isMobile = typeof window !== "undefined" && window.innerWidth < 760;
  const list = data as BackgroundAsset[];
  const filtered = list.filter((a) => {
    const d = (a as unknown as { device?: string }).device || "all";
    if (d === "all") return true;
    return isMobile ? d === "mobile" : d === "desktop";
  });
  return filtered.length > 0 ? filtered : list;
}

export async function loadRotationSettings(): Promise<RotationSettings> {
  if (!supabase) return DEFAULT_ROTATION;
  const { data, error } = await supabase
    .from("background_rotation_settings")
    .select("mode,interval_minutes,category,source_id,collection,pinned_asset_id")
    .eq("id", "default")
    .single();
  if (error || !data) return DEFAULT_ROTATION;
  return data as RotationSettings;
}

// ---- 轮换选择 ----
const RECENT_KEY = "outai-bg-recent";
const LOCK_KEY = "outai-bg-lock";

function getRecentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function pushRecentId(id: string) {
  try {
    const recent = getRecentIds().filter((x) => x !== id);
    recent.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {
    /* ignore */
  }
}

export function isLocked(): boolean {
  try {
    const until = Number(localStorage.getItem(LOCK_KEY) || "0");
    return Date.now() < until;
  } catch {
    return false;
  }
}

export function lockCurrentBackground(minutes = 60) {
  try {
    localStorage.setItem(LOCK_KEY, String(Date.now() + minutes * 60 * 1000));
  } catch {
    /* ignore */
  }
}

export function pickNextBackground(
  assets: BackgroundAsset[],
  settings: RotationSettings,
  currentId: string | null,
  favorites: string[],
): BackgroundAsset | null {
  if (assets.length === 0) return null;
  // 手动固定 + 已锁定：不换。
  if (settings.mode === "manual" && settings.pinned_asset_id) {
    const pinned = assets.find((a) => a.id === settings.pinned_asset_id);
    if (pinned) return pinned;
  }
  if (isLocked() && currentId) {
    const cur = assets.find((a) => a.id === currentId);
    if (cur) return cur;
  }
  // 池子：按模式筛选。
  let pool = assets;
  if (settings.mode === "favorites") {
    pool = assets.filter((a) => favorites.includes(a.id));
    if (pool.length === 0) pool = assets;
  } else if (settings.mode === "category" && settings.category) {
    const c = assets.filter((a) => a.category === settings.category);
    if (c.length > 0) pool = c;
  } else if (settings.mode === "collection" && settings.collection) {
    // 收藏夹轮换：用本地收藏列表（与 favorites 模式同源）。
    pool = assets.filter((a) => favorites.includes(a.id));
    if (pool.length === 0) pool = assets;
  } else if (settings.mode === "daily") {
    // 每日更换：按日期种子选一个（同一天内稳定）。
    const day = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return pool[hash % pool.length];
  }
  // 随机：避免最近 5 个重复。
  const recent = getRecentIds();
  const candidates = pool.filter((a) => !recent.includes(a.id) && a.id !== currentId);
  const chosen = (candidates.length > 0 ? candidates : pool)[Math.floor(Math.random() * (candidates.length > 0 ? candidates.length : pool.length))];
  if (chosen) pushRecentId(chosen.id);
  return chosen || null;
}

export function pickRandomBackground(
  assets: BackgroundAsset[],
  currentId: string | null,
): BackgroundAsset | null {
  if (assets.length === 0) return null;
  const recent = getRecentIds();
  const candidates = assets.filter((a) => !recent.includes(a.id) && a.id !== currentId);
  const pool = candidates.length > 0 ? candidates : assets;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  if (chosen) pushRecentId(chosen.id);
  return chosen;
}
