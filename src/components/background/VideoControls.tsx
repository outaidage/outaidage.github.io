// VideoControls.tsx — 视频背景的前台控制（页脚，动效开关旁）。
//  - 播放 / 暂停：切换后写入 localStorage（outai-video-bg），刷新后保持。
//  - 换个背景：仅当有 2 个及以上已配置视频的场景时显示，点击循环切换。
// 无视频场景时只显示暂停开关（此时它控制的是静态回退的显示，无副作用）。
import { useEffect, useState } from "react";
import {
  enabledScenes,
  loadVideoScenes,
  sceneHasVideo,
  type VideoScene,
} from "@/config/video-scenes";

const STORAGE_KEY = "outai-video-bg";

export default function VideoControls() {
  const [paused, setPaused] = useState(false);
  const [videoScenes, setVideoScenes] = useState<VideoScene[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPaused(localStorage.getItem(STORAGE_KEY) === "paused");
    } catch {
      /* ignore */
    }
    let cancelled = false;
    loadVideoScenes().then(({ scenes, defaultSceneId }) => {
      if (cancelled) return;
      const withVideo = enabledScenes(scenes).filter(sceneHasVideo);
      setVideoScenes(withVideo);
      setCurrentId(defaultSceneId);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "paused" : "playing");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("outai:toggle-video-bg"));
  };

  const cycleScene = () => {
    if (videoScenes.length < 2) return;
    const idx = videoScenes.findIndex((s) => s.id === currentId);
    const next = videoScenes[(idx + 1) % videoScenes.length];
    setCurrentId(next.id);
    window.dispatchEvent(
      new CustomEvent("outai:video-scene-change", {
        detail: { sceneId: next.id },
      }),
    );
  };

  return (
    <span className="video-controls" role="group" aria-label="视频背景控制">
      <button
        className="motion-toggle video-bg-toggle"
        type="button"
        onClick={toggle}
        aria-pressed={paused}
        title={paused ? "恢复视频背景" : "暂停视频背景"}
      >
        背景：{paused ? "已暂停" : "播放中"}
      </button>
      {videoScenes.length >= 2 ? (
        <button
          className="motion-toggle video-bg-toggle"
          type="button"
          onClick={cycleScene}
          title="切换到下一个视频背景"
        >
          换个背景
        </button>
      ) : null}
    </span>
  );
}
