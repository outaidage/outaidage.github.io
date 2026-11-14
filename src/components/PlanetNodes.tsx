// PlanetNodes.tsx — 3D 星球周围的可交互功能节点（数字宇宙导航中心）。
// 节点数据来自 home_modules（后台管理，不硬编码）；位置由轨道 + 角度计算，
// 沿轨道缓慢移动（requestAnimationFrame 更新 transform，GPU 合成）。
// 节点是 HTML <a>（不是 WebGL 内嵌文字）：文字清晰、可访问、点击可靠。
// 悬停：节点放大 + 对应轨道增亮 + 底部信息面板显示名称/描述/数量。
// 点击：聚焦光晕后直接跳转对应页面（<a> 天然导航，不只做视觉反馈）。
// 减动效或动效关闭时节点静止；移动端（<760px）改为星球下方的横向节点条。
import { useEffect, useRef, useState } from "react";
import type { PlanetNode } from "@/lib/home-modules";

// 轨道半径（px，相对星球中心；core-stage 高 420px，取椭圆轨道 y 压缩 0.52）。
const ORBIT_RADIUS: Record<number, number> = { 1: 128, 2: 172, 3: 212 };
// 每秒角速度（度），内快外慢。
const ORBIT_SPEED: Record<number, number> = { 1: 6, 2: 4, 2.5: 2.5, 3: 2.5 };
// 轨道椭圆 y 压缩比（模拟倾斜轨道平面）。
const ELLIPSE_Y = 0.52;

const SIZE_PX: Record<string, number> = { sm: 34, md: 42, lg: 52 };

export default function PlanetNodes({ nodes, base }: { nodes: PlanetNode[]; base: string }) {
  const [angles, setAngles] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const n of nodes) init[n.id] = n.computedAngle;
    return init;
  });
  const [hovered, setHovered] = useState<PlanetNode | null>(null);
  const [reduced, setReduced] = useState(false);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const anglesRef = useRef(angles);
  anglesRef.current = angles;

  useEffect(() => {
    // 与全站动效开关一致：显式 "reduced" 强制静止，显式 "full" 强制运动，否则跟随系统。
    const stored = document.documentElement.dataset.motion;
    const isReduced =
      stored === "reduced" ||
      (stored !== "full" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setReduced(isReduced);
    if (isReduced) return;
    lastRef.current = performance.now();
    const tick = (t: number) => {
      const dt = Math.min((t - lastRef.current) / 1000, 0.1);
      lastRef.current = t;
      setAngles((prev) => {
        const next: Record<string, number> = {};
        for (const n of nodes) {
          const speed = ORBIT_SPEED[n.orbit || 1] ?? 4;
          next[n.id] = ((prev[n.id] ?? n.computedAngle) + speed * dt) % 360;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const active = hovered;

  return (
    <>
      {/* 桌面端：环绕星球的轨道节点 */}
      <div className="planet-nodes" aria-label="功能节点">
        {nodes.map((n) => {
          const angle = ((angles[n.id] ?? n.computedAngle) * Math.PI) / 180;
          const r = ORBIT_RADIUS[n.orbit || 1] ?? 172;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r * ELLIPSE_Y;
          const size = SIZE_PX[n.node_size || "md"] ?? 42;
          const isActive = active?.id === n.id;
          return (
            <a
              key={n.id}
              href={`${base.replace(/\/$/, "")}${n.path}`}
              className="planet-node"
              data-orbit={n.orbit || 1}
              data-active={isActive || undefined}
              style={{
                width: size,
                height: size,
                transform: `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`,
                borderColor: `${n.theme_color}66`,
                color: n.theme_color,
                boxShadow: isActive ? `0 0 24px ${n.theme_color}88, 0 0 48px ${n.theme_color}44` : undefined,
              }}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered((h) => (h?.id === n.id ? null : h))}
              onFocus={() => setHovered(n)}
              onBlur={() => setHovered((h) => (h?.id === n.id ? null : h))}
              aria-label={`${n.name}：${n.description}`}
            >
              <span className="planet-node-icon" aria-hidden="true">{n.icon}</span>
              {n.featured ? <span className="planet-node-star" aria-hidden="true">★</span> : null}
            </a>
          );
        })}
        {/* 悬停信息面板（固定在舞台底部，不遮挡星球） */}
        <div className={`planet-info ${active ? "visible" : ""}`} aria-live="polite">
          {active ? (
            <>
              <span className="planet-info-icon" style={{ color: active.theme_color }}>{active.icon}</span>
              <span className="planet-info-text">
                <strong>{active.name}</strong>
                <span>{active.description}</span>
              </span>
              {active.count !== null && active.count !== undefined ? (
                <span className="planet-info-count">{active.count} 条</span>
              ) : null}
              <span className="planet-info-go">进入 →</span>
            </>
          ) : (
            <span className="planet-info-hint">悬停节点查看详情，点击进入</span>
          )}
        </div>
      </div>
      {/* 移动端：星球下方的横向节点条（不缩小桌面布局） */}
      <div className="planet-nodes-mobile" aria-label="功能节点">
        {nodes.map((n) => (
          <a
            key={n.id}
            href={`${base.replace(/\/$/, "")}${n.path}`}
            className="planet-node-chip"
            style={{ borderColor: `${n.theme_color}55`, color: n.theme_color }}
          >
            <span aria-hidden="true">{n.icon}</span>
            <span>{n.name}</span>
            {n.count !== null && n.count !== undefined ? <em>{n.count}</em> : null}
          </a>
        ))}
      </div>
    </>
  );
}
