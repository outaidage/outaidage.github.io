// BackgroundControls.tsx — 首页背景控制面板（可收起）。
// 功能：上一张 / 下一张 / 随机 / 喜欢 / 收藏 / 暂停背景；显示当前背景名称 + 作者 + 来源。
// 与 VideoSceneManager 通过自定义事件通信（outai:bg-next / outai:bg-prev / outai:bg-random /
// outai:bg-toggle-pause），不直接操作播放器内部状态。
// 喜欢/收藏状态存在 localStorage（访客）并同步到 Supabase；不强制注册。
import { useEffect, useState } from "react";
import {
  getLocalFavorites,
  getLocalLikes,
  toggleFavorite,
  toggleLike,
  type BackgroundAsset,
} from "@/lib/background-player";

export default function BackgroundControls({ asset }: { asset: BackgroundAsset | null }) {
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [likeCount, setLikeCount] = useState<number | null>(null);

  useEffect(() => {
    if (!asset) return;
    setLiked(getLocalLikes().has(asset.id));
    setFavorited(getLocalFavorites().includes(asset.id));
  }, [asset]);

  if (!asset) return null;

  const dispatch = (type: string) => {
    window.dispatchEvent(new CustomEvent(type));
  };

  return (
    <div className="bg-controls" aria-label="背景控制">
      {open ? (
        <div className="bg-controls-panel">
          <div className="bg-controls-info">
            <span className="bg-controls-name">{asset.title}</span>
            <span className="bg-controls-meta">
              {asset.author ? `${asset.author} · ` : ""}
              {asset.source || "OUTAI"}
              {likeCount !== null ? ` · ♥ ${likeCount}` : ""}
            </span>
          </div>
          <div className="bg-controls-buttons">
            <button type="button" onClick={() => dispatch("outai:bg-prev")} title="上一张" aria-label="上一张背景">‹</button>
            <button type="button" onClick={() => dispatch("outai:bg-next")} title="下一张" aria-label="下一张背景">›</button>
            <button type="button" onClick={() => dispatch("outai:bg-random")} title="随机" aria-label="随机背景">⚄</button>
            <button
              type="button"
              className={liked ? "active" : ""}
              onClick={async () => {
                const next = await toggleLike(asset.id);
                setLiked(next);
              }}
              title={liked ? "取消喜欢" : "喜欢"}
              aria-label={liked ? "取消喜欢" : "喜欢此背景"}
            >
              ♥
            </button>
            <button
              type="button"
              className={favorited ? "active" : ""}
              onClick={async () => {
                const next = await toggleFavorite(asset.id);
                setFavorited(next);
              }}
              title={favorited ? "取消收藏" : "收藏"}
              aria-label={favorited ? "取消收藏" : "收藏此背景"}
            >
              ★
            </button>
            <button type="button" onClick={() => dispatch("outai:toggle-video-bg")} title="暂停/恢复背景" aria-label="暂停或恢复背景">⏸</button>
            <button type="button" onClick={() => setOpen(false)} title="收起" aria-label="收起控制面板">✕</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="bg-controls-dot"
          onClick={() => setOpen(true)}
          title={`背景：${asset.title}（点击展开控制）`}
          aria-label={`背景控制：当前 ${asset.title}，点击展开`}
        >
          <span aria-hidden="true">◐</span>
        </button>
      )}
    </div>
  );
}
