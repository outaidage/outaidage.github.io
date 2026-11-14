// VideoSceneManager.tsx — OUTAI 电影级动态视频背景播放器。
//
// 常驻 MainLayout（client:load），因此在 Astro 视图切换导航中不卸载，
// 背景视频不会因切页而重新下载或重新初始化。仅在首页显示视频，
// 切到其他页面时淡出并暂停，回到首页再淡入恢复（视频元素始终挂载）。
//
// 行为：
//  - HTML5 <video>：autoplay / muted / loop / playsInline，object-fit: cover。
//  - WebM 优先，MP4 回退；桌面与移动可配不同文件；poster 封面先行。
//  - 只加载当前场景（preload="metadata"），不预加载其他场景。
//  - 场景切换用单视频元素 + 透明度交叉淡入淡出（下方始终有封面/渐变兜底）。
//  - 加载失败 → 显示封面或 CSS 深空渐变，首页永不空白。
//  - prefers-reduced-motion / 省流量 / 用户暂停 → 静态背景（不加载视频）。
//  - 页面不可见时暂停；回到首页且允许播放时恢复。
//  - 监听 outai:video-scene-change（后台预览 / 场景切换）与
//    outai:toggle-video-bg（暂停开关）。
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadVideoScenes,
  pickDefaultScene,
  resolveSceneVideo,
  sceneHasVideo,
  shouldUseStaticBackground,
  type VideoScene,
} from "@/config/video-scenes";

const HOME_PATHS = ["/", ""];
const STORAGE_KEY = "outai-video-bg";

function isHomePath(): boolean {
  if (typeof window === "undefined") return true;
  const p = window.location.pathname.replace(/\/+$/, "");
  return HOME_PATHS.includes(p);
}

function userPaused(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "paused";
  } catch {
    return false;
  }
}

export default function VideoSceneManager() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scene, setScene] = useState<VideoScene | null>(null);
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [visible, setVisible] = useState(() => isHomePath());
  const [paused, setPaused] = useState(() => userPaused());
  const [staticMode, setStaticMode] = useState(false);
  const currentSceneId = useRef<string | null>(null);
  const switching = useRef(false);

  // ---- 加载场景（Supabase → 静态 JSON → 内置占位） ----
  useEffect(() => {
    let cancelled = false;
    loadVideoScenes().then(({ scenes: list, defaultSceneId }) => {
      if (cancelled) return;
      setScenes(list);
      const def = pickDefaultScene(list, defaultSceneId);
      if (def) {
        currentSceneId.current = def.id;
        setScene(def);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- 静态模式（减动效 / 省流量 / 用户暂停） ----
  useEffect(() => {
    const check = () => setStaticMode(shouldUseStaticBackground());
    check();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) check();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ---- 切页时显隐（Astro 视图切换不卸载本组件） ----
  useEffect(() => {
    const sync = () => setVisible(isHomePath());
    document.addEventListener("astro:page-load", sync);
    sync();
    return () => document.removeEventListener("astro:page-load", sync);
  }, []);

  // ---- 切换场景（交叉淡入淡出；下方封面/渐变始终兜底） ----
  const switchScene = useCallback((next: VideoScene) => {
    const video = videoRef.current;
    if (!video) return;
    if (currentSceneId.current === next.id && videoReady) return;
    switching.current = true;
    currentSceneId.current = next.id;
    setVideoFailed(false);
    setVideoReady(false);
    setScene(next);
    // 先淡出，换源后再由 loadeddata / canplay 触发淡入。
    video.style.opacity = "0";
    const { webm, mp4, poster } = resolveSceneVideo(next);
    if (poster) video.setAttribute("poster", poster);
    else video.removeAttribute("poster");
    // 重建 <source>：WebM 优先，MP4 回退。
    while (video.firstChild) video.removeChild(video.firstChild);
    if (webm) {
      const s = document.createElement("source");
      s.src = webm;
      s.type = "video/webm";
      video.appendChild(s);
    }
    if (mp4) {
      const s = document.createElement("source");
      s.src = mp4;
      s.type = "video/mp4";
      video.appendChild(s);
    }
    if (!webm && !mp4) {
      // 未配置视频：保持静态回退，不加载任何内容。
      setVideoFailed(true);
      switching.current = false;
      return;
    }
    video.load();
    const tryPlay = () => {
      video.play().catch(() => {
        /* 自动播放被拦截时保持静音重试一次；仍失败则显示回退 */
      });
    };
    if (video.readyState >= 2) tryPlay();
    else video.addEventListener("canplay", tryPlay, { once: true });
    switching.current = false;
  }, [videoReady]);

  // ---- 场景就绪后应用（首次加载） ----
  useEffect(() => {
    if (!scene) return;
    if (staticMode) return;
    switchScene(scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, staticMode]);

  // ---- 后台预览 / 外部切换场景 ----
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ sceneId?: string }>).detail;
      const target = scenes.find((s) => s.id === detail?.sceneId);
      if (target && sceneHasVideo(target)) switchScene(target);
      else if (target) {
        // 无视频的场景：切到静态回退并更新遮罩。
        currentSceneId.current = target.id;
        setScene(target);
        setVideoFailed(true);
      }
    };
    window.addEventListener("outai:video-scene-change", onChange);
    return () =>
      window.removeEventListener("outai:video-scene-change", onChange);
  }, [scenes, switchScene]);

  // ---- 暂停开关（页脚按钮 / 键盘） ----
  useEffect(() => {
    const onToggle = () => {
      setPaused((prev) => {
        const next = !prev;
        try {
          localStorage.setItem(STORAGE_KEY, next ? "paused" : "playing");
        } catch {
          /* ignore */
        }
        return next;
      });
    };
    window.addEventListener("outai:toggle-video-bg", onToggle);
    return () =>
      window.removeEventListener("outai:toggle-video-bg", onToggle);
  }, []);

  // ---- 播放 / 暂停：综合（是否首页、是否静态、用户暂停、页面可见） ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const shouldPlay =
      visible && !staticMode && !paused && !videoFailed && !document.hidden;
    if (shouldPlay) {
      video.play().catch(() => {
        /* 自动播放被拦截：保持现状，显示当前帧/封面 */
      });
    } else {
      video.pause();
    }
  }, [visible, staticMode, paused, videoFailed, videoReady]);

  // ---- 页面不可见时暂停 ----
  useEffect(() => {
    const onVis = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else if (visible && !staticMode && !paused && !videoFailed) {
        video.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [visible, staticMode, paused, videoFailed]);

  // ---- 同步 <html> 状态，供全局 CSS 调整网格/辉光 ----
  useEffect(() => {
    const root = document.documentElement;
    if (staticMode || !scene || !sceneHasVideo(scene) || videoFailed) {
      root.dataset.videoBg = videoFailed ? "fallback" : "off";
    } else {
      root.dataset.videoBg = "active";
    }
  }, [staticMode, scene, videoFailed]);

  const overlay = scene
    ? {
        background: `linear-gradient(180deg, ${scene.overlayColor} 0%, transparent 30%, transparent 62%, ${scene.overlayColor} 100%)`,
        opacity: scene.overlayOpacity,
      }
    : undefined;

  return (
    <div
      className="video-bg-layer"
      aria-hidden="true"
      data-video-state={
        staticMode || videoFailed ? "fallback" : videoReady ? "ready" : "loading"
      }
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/* 静态回退：CSS 深空渐变（视频未配置 / 减动效 / 加载失败时显示） */}
      <div className="video-bg-fallback" />
      {/* 封面图（有配置时） */}
      {scene?.fallbackImage ? (
        <img
          className="video-bg-poster"
          src={scene.fallbackImage}
          alt=""
          draggable={false}
        />
      ) : null}
      <video
        ref={videoRef}
        className="video-bg-video"
        muted
        loop={scene?.playbackMode !== "once"}
        playsInline
        autoPlay
        preload="metadata"
        disablePictureInPicture
        tabIndex={-1}
        style={{
          objectPosition: scene?.focalPoint || "50% 50%",
          opacity: videoReady && !videoFailed ? 1 : 0,
        }}
        onLoadedData={() => {
          setVideoReady(true);
          setVideoFailed(false);
          const v = videoRef.current;
          if (v) v.style.opacity = "1";
        }}
        onCanPlay={() => {
          setVideoReady(true);
          setVideoFailed(false);
        }}
        onError={() => {
          // WebM 失败时浏览器会自动尝试下一个 <source>（MP4）；
          // 只有全部失败才会触发 video 元素的 error。
          setVideoFailed(true);
          setVideoReady(false);
          const v = videoRef.current;
          if (v) v.style.opacity = "0";
        }}
        onStalled={() => {
          /* 网络中断：保持当前帧，等待恢复；不清空画面 */
        }}
      />
      {/* 场景遮罩：保证前景文字清晰 */}
      {overlay ? <div className="video-bg-overlay" style={overlay} /> : null}
    </div>
  );
}
