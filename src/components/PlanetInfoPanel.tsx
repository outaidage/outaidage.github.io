// PlanetInfoPanel.tsx — 行星 / 卫星信息面板（HTML 覆盖层，位于 3D 舞台左下）。
// 点击行星 → 聚焦该行星并显示此面板；面板里的「进入」与卫星列表都是
// 真实 <a> 链接（指向对应页面，数量来自真实数据），由 Astro 原生处理跳转
// （不 preventDefault、不走编程式 navigate，避免移动端转场卡住黑屏）。
// 外链（收藏的书签 URL）在新标签页打开。

import type { PlanetDef, Satellite } from "@/lib/planets";

function isExternal(path: string): boolean {
  return /^https?:\/\//.test(path);
}

export function PlanetInfoPanel({ planet, satellites, hoveredSatellite, onClose }: {
  planet: PlanetDef | null;
  satellites: Satellite[];
  hoveredSatellite: Satellite | null;
  onClose: () => void;
}) {
  // 卫星悬停时，面板临时显示该卫星的信息（不改变聚焦的行星）。
  if (hoveredSatellite) {
    const s = hoveredSatellite;
    return (
      <div className="planet-info visible" role="status">
        <span className="planet-info-icon">✦</span>
        <div className="planet-info-text">
          <strong>{s.name}</strong>
          <span>{s.description}</span>
        </div>
        {typeof s.count === "number" && <span className="planet-info-count">{s.count}条</span>}
        <a className="planet-info-go" href={s.path} {...(isExternal(s.path) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>打开 →</a>
      </div>
    );
  }
  if (!planet) {
    return (
      <div className="planet-info" aria-hidden="true">
        <span className="planet-info-icon">✦</span>
        <div className="planet-info-text">
          <strong>OUTAI 宇宙</strong>
          <span>点击一颗行星，查看它的功能与卫星</span>
        </div>
        <span className="planet-info-hint">DRAG · SCROLL</span>
      </div>
    );
  }
  return (
    <div className="planet-info visible planet-info-panel" role="status">
      <span className="planet-info-icon" style={{ color: planet.color }}>{planet.icon}</span>
      <div className="planet-info-text">
        <strong>{planet.name} · {planet.func}</strong>
        <span>{planet.description}</span>
        {satellites.length > 0 && (
          <span className="planet-info-sats">
            {satellites.map((s) => (
              <a key={s.id} href={s.path} {...(isExternal(s.path) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {s.name}{typeof s.count === "number" ? ` (${s.count})` : ""}
              </a>
            ))}
          </span>
        )}
      </div>
      <a className="planet-info-go" href={planet.path}>进入 →</a>
      <button className="planet-info-close" type="button" onClick={onClose} aria-label="返回全景">✕</button>
    </div>
  );
}
