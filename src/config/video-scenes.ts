// video-scenes.ts — OUTAI 电影级动态视频背景：场景配置与加载。
//
// 单一事实来源（按优先级）：
//   1. Supabase `video_scenes` 表（公开读、仅 enabled，按 sort_order 排序）。
//      后台「背景与媒体管理」直接写这张表，改完立即生效，无需重新部署。
//   2. public/config/video-scenes.json（静态回退；Supabase 不可用或无场景时使用）。
//   3. 本文件内置的 PLACEHOLDER_SCENES（最后的保底，同样是占位）。
//
// 视频地址：R2 公共 URL 或自定义媒体域名（media.outaidage.xyz）。
//   示例格式（仅作格式参考，尚未上传真实文件前不要把它当成可用链接）：
//     https://media.outaidage.xyz/videos/deep-space.webm
//     https://media.outaidage.xyz/videos/deep-space.mp4
//   真实文件由站长在 Cloudflare R2 自行上传；没有真实视频时，
//   desktopVideoUrl / mobileVideoUrl 留空字符串，播放器会显示封面/渐变，
//   绝不伪造“已上传 / 播放成功”。
//
// 不把任何 Secret、Service Role Key、GitHub Token 放在这里或前端。

export type VideoPlaybackMode = "loop" | "once";

export type VideoScene = {
  id: string;
  name: string;
  description: string;
  /** 桌面端视频（WebM 优先；留空 = 未配置，显示封面/渐变）。 */
  desktopVideoUrl: string;
  /** 移动端视频（更小码率；留空 = 复用桌面端；两者都空 = 未配置）。 */
  mobileVideoUrl: string;
  /** 桌面端 MP4 兼容地址（WebM 不支持时的回退；留空 = 无）。 */
  desktopVideoMp4Url?: string;
  /** 移动端 MP4 兼容地址（留空 = 无）。 */
  mobileVideoMp4Url?: string;
  /** 封面图（视频加载前与加载失败时显示；留空 = 使用 CSS 深空渐变）。 */
  fallbackImage: string;
  enabled: boolean;
  sortOrder: number;
  playbackMode: VideoPlaybackMode;
  /** 遮罩不透明度 0..1（视频上方的深色渐变，保证前景文字清晰）。 */
  overlayOpacity: number;
  /** 遮罩颜色（默认深空黑）。 */
  overlayColor: string;
  /** 视频焦点（object-position，如 "50% 50%"），控制不同比例下的裁切中心。 */
  focalPoint: string;
  createdAt: string;
  updatedAt: string;
};

export type VideoScenesConfig = {
  version: number;
  mediaBaseUrl: string;
  defaultSceneId: string;
  scenes: VideoScene[];
};

/** 媒体域名（R2 自定义域名）。尚未确认配置完成前，仅作配置占位。 */
export const MEDIA_BASE_URL = "https://media.outaidage.xyz";

export const DEFAULT_SCENE_ID = "deep-space";

const stamp = "2026-11-14";

/**
 * 预置 6 个场景。视频地址全部留空（占位），因为还没有真实视频文件。
 * 封面也留空，播放器会用 CSS 深空渐变 + 现有 2D 星空画布作视觉回退。
 * 填入真实 R2 地址后，这些场景即可直接播放，无需改代码。
 */
export const PLACEHOLDER_SCENES: VideoScene[] = [
  {
    id: "deep-space",
    name: "深空宇宙",
    description: "深邃星空与缓慢漂移的星云，默认首页背景。",
    desktopVideoUrl: "",
    mobileVideoUrl: "",
    fallbackImage: "",
    enabled: true,
    sortOrder: 1,
    playbackMode: "loop",
    overlayOpacity: 0.55,
    overlayColor: "#03040b",
    focalPoint: "50% 50%",
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "floating-islands",
    name: "梦幻漂浮岛屿",
    description: "云海之上的漂浮岛屿，柔和光线与雾效。",
    desktopVideoUrl: "",
    mobileVideoUrl: "",
    fallbackImage: "",
    enabled: true,
    sortOrder: 2,
    playbackMode: "loop",
    overlayOpacity: 0.5,
    overlayColor: "#03040b",
    focalPoint: "50% 50%",
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "deep-sea",
    name: "深海世界",
    description: "深蓝海水、光束与缓慢上浮的气泡。",
    desktopVideoUrl: "",
    mobileVideoUrl: "",
    fallbackImage: "",
    enabled: true,
    sortOrder: 3,
    playbackMode: "loop",
    overlayOpacity: 0.55,
    overlayColor: "#020617",
    focalPoint: "50% 50%",
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "future-city",
    name: "未来科技城市",
    description: "霓虹灯下的未来城市，青色与紫色光影。",
    desktopVideoUrl: "",
    mobileVideoUrl: "",
    fallbackImage: "",
    enabled: true,
    sortOrder: 4,
    playbackMode: "loop",
    overlayOpacity: 0.5,
    overlayColor: "#03040b",
    focalPoint: "50% 50%",
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "nebula-planets",
    name: "星云与星球",
    description: "绚烂星云环绕行星，适合大屏展示。",
    desktopVideoUrl: "",
    mobileVideoUrl: "",
    fallbackImage: "",
    enabled: true,
    sortOrder: 5,
    playbackMode: "loop",
    overlayOpacity: 0.55,
    overlayColor: "#03040b",
    focalPoint: "50% 50%",
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "minimal-motion",
    name: "极简动态背景",
    description: "极简的缓慢渐变与微光，低性能设备首选。",
    desktopVideoUrl: "",
    mobileVideoUrl: "",
    fallbackImage: "",
    enabled: true,
    sortOrder: 6,
    playbackMode: "loop",
    overlayOpacity: 0.45,
    overlayColor: "#03040b",
    focalPoint: "50% 50%",
    createdAt: stamp,
    updatedAt: stamp,
  },
];

export const PLACEHOLDER_CONFIG: VideoScenesConfig = {
  version: 1,
  mediaBaseUrl: MEDIA_BASE_URL,
  defaultSceneId: DEFAULT_SCENE_ID,
  scenes: PLACEHOLDER_SCENES,
};

/** 场景是否有可播放的视频地址（桌面或移动任一非空即视为已配置）。 */
export function sceneHasVideo(scene: VideoScene): boolean {
  return Boolean(
    scene.desktopVideoUrl?.trim() ||
      scene.mobileVideoUrl?.trim() ||
      scene.desktopVideoMp4Url?.trim() ||
      scene.mobileVideoMp4Url?.trim(),
  );
}

/** 按 sortOrder 排序并只保留 enabled 的场景。 */
export function enabledScenes(scenes: VideoScene[]): VideoScene[] {
  return [...scenes]
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 选取默认场景：优先 defaultSceneId，其次第一个 enabled 场景。 */
export function pickDefaultScene(
  scenes: VideoScene[],
  defaultSceneId?: string,
): VideoScene | null {
  const enabled = enabledScenes(scenes);
  if (!enabled.length) return null;
  return (
    enabled.find((s) => s.id === defaultSceneId) ??
    enabled.find((s) => s.id === DEFAULT_SCENE_ID) ??
    enabled[0]
  );
}

/** 是否移动端（用于选择 mobileVideoUrl）。宽度 < 760 与触屏任一成立即视为移动。 */
export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth < 760 ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

/** 为当前设备解析场景的视频地址（WebM 优先，MP4 回退）。 */
export function resolveSceneVideo(scene: VideoScene): {
  webm: string;
  mp4: string;
  poster: string;
} {
  const mobile = isMobileViewport();
  const webm = mobile
    ? scene.mobileVideoUrl?.trim() || scene.desktopVideoUrl?.trim() || ""
    : scene.desktopVideoUrl?.trim() || scene.mobileVideoUrl?.trim() || "";
  const mp4 = mobile
    ? scene.mobileVideoMp4Url?.trim() || scene.desktopVideoMp4Url?.trim() || ""
    : scene.desktopVideoMp4Url?.trim() || scene.mobileVideoMp4Url?.trim() || "";
  return { webm, mp4, poster: scene.fallbackImage?.trim() || "" };
}

/** 是否应使用静态背景（减动效 / 省流量 / 用户已暂停）。 */
export function shouldUseStaticBackground(): boolean {
  if (typeof window === "undefined") return false;
  // No stored preference means video is ON (same rule as the motion
  // toggle): only an explicit stored "reduced" forces static.
  if (document.documentElement.dataset.motion === "reduced") return true;
  // 省流量模式：navigator.connection.saveData（Chrome/Android）。
  const conn = (navigator as unknown as { connection?: { saveData?: boolean } })
    .connection;
  if (conn?.saveData) return true;
  try {
    if (localStorage.getItem("outai-video-bg") === "paused") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * 加载场景配置。来源优先级：Supabase video_scenes → 静态 JSON → 内置占位。
 * 返回场景列表与实际来源，调用方据此决定显示内容与提示。
 */
export async function loadVideoScenes(): Promise<{
  scenes: VideoScene[];
  defaultSceneId: string;
  source: "supabase" | "json" | "builtin";
}> {
  // 1. Supabase（公开读）。动态 import 避免在无配置时引入失败。
  try {
    const { supabase } = await import("@/lib/supabase");
    if (supabase) {
      const { data, error } = await supabase
        .from("video_scenes")
        .select(
          "id,name,description,desktop_video_url,mobile_video_url,desktop_video_mp4_url,mobile_video_mp4_url,fallback_image,enabled,sort_order,playback_mode,overlay_opacity,overlay_color,focal_point,is_default,created_at,updated_at",
        )
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        const scenes: VideoScene[] = (data as Record<string, unknown>[]).map(
          (row) => ({
            id: String(row.id ?? ""),
            name: String(row.name ?? ""),
            description: String(row.description ?? ""),
            desktopVideoUrl: String(row.desktop_video_url ?? ""),
            mobileVideoUrl: String(row.mobile_video_url ?? ""),
            desktopVideoMp4Url: String(row.desktop_video_mp4_url ?? ""),
            mobileVideoMp4Url: String(row.mobile_video_mp4_url ?? ""),
            fallbackImage: String(row.fallback_image ?? ""),
            enabled: row.enabled !== false,
            sortOrder: Number(row.sort_order ?? 0),
            playbackMode:
              row.playback_mode === "once" ? "once" : "loop",
            overlayOpacity: Number(row.overlay_opacity ?? 0.55),
            overlayColor: String(row.overlay_color ?? "#03040b"),
            focalPoint: String(row.focal_point ?? "50% 50%"),
            createdAt: String(row.created_at ?? ""),
            updatedAt: String(row.updated_at ?? ""),
          }),
        );
        const defRow = (data as Record<string, unknown>[]).find(
          (r) => r.is_default === true,
        );
        return {
          scenes,
          defaultSceneId: defRow
            ? String(defRow.id)
            : DEFAULT_SCENE_ID,
          source: "supabase",
        };
      }
    }
  } catch {
    /* Supabase 不可用或表不存在 → 回退到静态 JSON */
  }

  // 2. 静态 JSON（public/config/video-scenes.json，随站点部署）。
  try {
    const res = await fetch(
      `${import.meta.env.BASE_URL}config/video-scenes.json`,
      { cache: "no-cache" },
    );
    if (res.ok) {
      const cfg = (await res.json()) as VideoScenesConfig;
      if (Array.isArray(cfg.scenes) && cfg.scenes.length > 0) {
        return {
          scenes: cfg.scenes,
          defaultSceneId: cfg.defaultSceneId || DEFAULT_SCENE_ID,
          source: "json",
        };
      }
    }
  } catch {
    /* 忽略，走内置占位 */
  }

  // 3. 内置占位。
  return {
    scenes: PLACEHOLDER_SCENES,
    defaultSceneId: DEFAULT_SCENE_ID,
    source: "builtin",
  };
}
