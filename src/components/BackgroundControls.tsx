// BackgroundControls.tsx — 右下角散花式轮子菜单（取代原来的大面板）。
// 主轮子 ◐ 固定在右下角；点一下，功能轮子像散花一样扇形弹开，
// 每个轮子独立控制一个功能，以后加功能只要往 WHEELS 里加一行，
// 不用改结构。弹出带回弹 + 依次错开（像标题逐字蹦出来那种感觉）。
// 轮子：动态背景开关 / 动效开关 / 重播开场 / 下一张背景 / 喜欢 / 收藏。
// 没有背景素材时只显示前三个全局轮子（背景、动效、重播）。
import { useEffect, useRef, useState } from "react";
import {
  getLocalFavorites,
  getLocalLikes,
  toggleFavorite,
  toggleLike,
  type BackgroundAsset,
} from "@/lib/background-player";

const MOTION_KEY = "outai-motion";
const VIDEO_BG_KEY = "outai-video-bg";
const FAN_RADIUS = 150;

type WheelDef = {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  needsAsset?: boolean;
  onClick: () => void | Promise<void>;
};

function readMotionOn(): boolean {
  try {
    if (typeof document !== "undefined") {
      return document.documentElement.dataset.motion !== "reduced";
    }
  } catch {
    /* ignore */
  }
  return true;
}

function readVideoPaused(): boolean {
  try {
    return localStorage.getItem(VIDEO_BG_KEY) === "paused";
  } catch {
    return false;
  }
}

// 扇形位置：从正上方（90°）到正左方（180°）均匀排开，半径 FAN_RADIUS。
// 轮子少时自动拉开角度，不留空缺。
function fanPosition(index: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: -FAN_RADIUS };
  const angle = 90 + (90 * index) / (total - 1);
  const rad = (angle * Math.PI) / 180;
  return {
    x: Math.round(FAN_RADIUS * Math.cos(rad)),
    y: Math.round(-FAN_RADIUS * Math.sin(rad)),
  };
}

export default function BackgroundControls({
  asset,
}: {
  asset: BackgroundAsset | null;
}) {
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [motionOn, setMotionOn] = useState(true);
  const [videoPaused, setVideoPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!asset) return;
    setLiked(getLocalLikes().has(asset.id));
    setFavorited(getLocalFavorites().includes(asset.id));
  }, [asset]);

  // 每次打开时重新读取最新状态（避免与页脚旧开关或其它入口改动后不一致）。
  useEffect(() => {
    if (!open) return;
    setMotionOn(readMotionOn());
    setVideoPaused(readVideoPaused());
  }, [open ]);

  // 点到菜单外面就收起来。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open ]);

  const dispatch = (type: string) => {
    window.dispatchEvent(new CustomEvent(type));
  };

  const toggleMotion = () => {
    const next = !motionOn;
    setMotionOn(next);
    try {
      document.documentElement.dataset.motion = next ? "full" : "reduced";
      localStorage.setItem(MOTION_KEY, next ? "full" : "reduced");
    } catch {
      /* ignore */
    }
  };

  const toggleVideo = () => {
    const next = !videoPaused;
    setVideoPaused(next);
    dispatch("outai:toggle-video-bg");
  };

  const replayBoot = () => {
    try {
      sessionStorage.setItem("outai-boot-replay", "1");
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  };

  const wheels: WheelDef[] = [
    {
      id: "bg",
      label: videoPaused ? "恢复动态背景" : "暂停动态背景",
      icon: videoPaused ? "▶" : "⏸",
      active: !videoPaused,
      onClick: toggleVideo,
    },
    {
      id: "motion",
      label: motionOn ? "关闭动效" : "开启动效",
      icon: "✦",
      active: motionOn,
      onClick: toggleMotion,
    },
    { id: "replay", label: "重播开场", icon: "↻", onClick: replayBoot },
    {
      id: "next",
      label: "下一个背景",
      icon: "›",
      needsAsset: true,
      onClick: () => dispatch("outai:bg-next"),
    },
    {
      id: "like",
      label: liked ? "取消喜欢" : "喜欢此背景",
      icon: "♥",
      active: liked,
      needsAsset: true,
      onClick: async () => {
        if (!asset) return;
        setLiked(await toggleLike(asset.id));
      },
    },
    {
      id: "fav",
      label: favorited ? "取消收藏" : "收藏此背景",
      icon: "★",
      active: favorited,
      needsAsset: true,
      onClick: async () => {
        if (!asset) return;
        setFavorited(await toggleFavorite(asset.id));
      },
    },
  ];
  const visible = wheels.filter((w) => !w.needsAsset || asset);

  return (
    <div
      ref={rootRef}
      className={`radial-controls${open ? " radial-open" : ""}`}
      aria-label="背景控制"
    >
      {asset && open ? (
        <div className="radial-info" aria-hidden="true">
          <span className="radial-info-name">{asset.title}</span>
          {asset.author ? (
            <span className="radial-info-meta">{asset.author}</span>
          ) : null}
        </div>
      ) : null}
      {visible.map((w, i) => {
        const pos = fanPosition(i, visible.length);
        return (
          <button
            key={w.id}
            type="button"
            className={`radial-wheel${w.active ? " active" : ""}`}
            style={
              {
                "--tx": `${pos.x}px`,
                "--ty": `${pos.y}px`,
                "--i": i,
              } as React.CSSProperties
            }
            onClick={w.onClick}
            title={w.label}
            aria-label={w.label}
            tabIndex={open ? 0 : -1}
          >
            <span aria-hidden="true">{w.icon}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="radial-main"
        onClick={() => setOpen((v) => !v)}
        title={
          open
            ? "收起"
            : `背景：${asset ? asset.title : "动态背景"}（点击展开）`
        }
        aria-label={open ? "收起背景控制" : "展开背景控制"}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? "✕" : "◐"}</span>
      </button>
    </div>
  );
}
