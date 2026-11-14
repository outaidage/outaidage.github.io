// SpaceCore.tsx — OUTAI 3D 宇宙主场景（Galaxy Explorer + Solar System）。
// 一个 R3F 场景，包含：真实地球（NASA 贴图，太阳系一员，绕太阳公转）、
// 程序化螺旋银河系、太阳 + 八大行星 + 卫星子功能、背景星空。
// 五种观察模式（UNIVERSE / EARTH / GALAXY / NAVIGATION / SOLAR SYSTEM）
// 共用同一个场景，只改变相机与图层状态，不重建场景。
// 相机在地球跟踪模式下跟随地球（地球公转时相机绕太阳同步旋转，
// 太阳相对相机的位置不变，地球始终以同样的昼夜面朝向相机；
// 用户的拖拽/缩放偏移保持不变）；聚焦行星时跟随该行星。

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SolarSystem, go } from "@/components/SolarSystem";
import { PlanetInfoPanel } from "@/components/PlanetInfoPanel";
import { PLANET_MAP, type PlanetId, type Satellite } from "@/lib/planets";

type Mode = "universe" | "earth" | "galaxy" | "navigation" | "solar";

const MODE_LABELS: Record<Mode, { label: string; icon: string }> = {
  universe: { label: "UNIVERSE", icon: "◎" },
  earth: { label: "EARTH", icon: "◉" },
  galaxy: { label: "GALAXY", icon: "✦" },
  navigation: { label: "NAVIGATION", icon: "⬡" },
  solar: { label: "SOLAR SYSTEM", icon: "☉" },
};

// 地球跟踪模式下的相机偏移（相对地球位置）。
// NAVIGATION 改为固定姿态：以太阳为中心俯瞰整个太阳系（八大行星全部入框），
// 地球跟踪视角装不下天王星/海王星（轨道 23/26，距地球最远 30+）。
const TRACK_OFFSETS: Record<Mode, [number, number, number] | null> = {
  universe: [0, 2.5, 12],
  earth: [0, 0.8, 3.4],
  galaxy: null,
  navigation: null,
  solar: null,
};
// 固定模式的相机位姿（世界坐标）。
const FIXED_POSES: Partial<Record<Mode, { pos: [number, number, number]; target: [number, number, number] }>> = {
  galaxy: { pos: [0, 55, 45], target: [5, -1.5, -20] },
  navigation: { pos: [0, 60, 35], target: [0, 0, 0] },
  solar: { pos: [0, 42, 68], target: [0, 0, 0] },
};

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function isTrackingMode(mode: Mode): boolean {
  return TRACK_OFFSETS[mode] !== null;
}

// ---------- 银河系 ----------
const GALAXY_CENTER: [number, number, number] = [5, -1.5, -20];
const GALAXY_TILT: [number, number, number] = [-0.12, 0, 0.45];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand: () => number): number {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

function buildGalaxy(count: number, seed: number) {
  const rand = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const cA = new THREE.Color("#ffe9b8");
  const cB = new THREE.Color("#ffb36b");
  const cC = new THREE.Color("#cfe4ff");
  const cD = new THREE.Color("#a68aff");
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, z = 0, s = 0.1;
    const u = rand();
    if (u < 0.28) {
      const r = Math.abs(gauss(rand)) * 5.5;
      const a = rand() * Math.PI * 2;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      y = gauss(rand) * 1.6;
      tmp.lerpColors(cA, cB, rand());
      s = 0.1 + rand() * 0.22;
    } else {
      const arm = Math.floor(rand() * 4);
      const r = 2 + Math.pow(rand(), 0.65) * 33;
      const spread = 0.42 * (1 - r / 40) + 0.1;
      const a = (arm / 4) * Math.PI * 2 + r * 0.135 + gauss(rand) * spread;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      y = gauss(rand) * (2.0 * (1 - r / 38) + 0.3);
      const t = r / 35;
      if (t < 0.35) tmp.lerpColors(cB, cC, t / 0.35);
      else tmp.lerpColors(cC, cD, (t - 0.35) / 0.65);
      s = (0.05 + rand() * 0.17) * (1.15 - t * 0.45);
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    size[i] = Math.max(0.04, s);
    phase[i] = rand();
  }
  return { pos, col, size, phase };
}

function nebulaTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const galaxyVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vDist;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    vTwinkle = 0.72 + 0.28 * sin(uTime * 0.9 + aPhase * 6.2831);
    gl_PointSize = min(aSize * uScale * vTwinkle / max(vDist, 0.1), 18.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const galaxyFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vDist;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    float a = smoothstep(0.5, 0.08, d) * vTwinkle;
    // 太靠近相机的星点淡出，避免出现巨大光斑
    a *= smoothstep(1.0, 4.0, vDist);
    gl_FragColor = vec4(vColor, a);
  }
`;

const NEBULAE: { color: string; pos: [number, number, number]; scale: number; opacity: number }[] = [
  { color: "#ffb36b", pos: [0, 0, 0], scale: 20, opacity: 0.26 },
  { color: "#4d7cfe", pos: [14, 1, -6], scale: 22, opacity: 0.15 },
  { color: "#8b5cf6", pos: [-16, -1, 8], scale: 24, opacity: 0.14 },
  { color: "#61edff", pos: [-8, 2, -14], scale: 18, opacity: 0.12 },
  { color: "#a68aff", pos: [20, -1, 10], scale: 20, opacity: 0.13 },
  { color: "#4d7cfe", pos: [-24, 0, -4], scale: 22, opacity: 0.12 },
  { color: "#ffb36b", pos: [8, -2, 16], scale: 18, opacity: 0.12 },
  { color: "#8b5cf6", pos: [26, 1, -12], scale: 20, opacity: 0.12 },
];

function Galaxy({ count, motionPaused, visible }: { count: number; motionPaused: boolean; visible: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const { pos, col, size, phase } = buildGalaxy(count, 1337);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    return g;
  }, [count]);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const spinRef = useRef<THREE.Group>(null);
  const nebTex = useMemo(nebulaTexture, []);
  const { size } = useThree();
  const uScale = useMemo(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    return (size.height * dpr * 0.5) / Math.tan(THREE.MathUtils.degToRad(22.5));
  }, [size.height]);
  useFrame((state, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    if (!motionPaused && spinRef.current) spinRef.current.rotation.y += 0.008 * delta;
  });
  return (
    <group position={GALAXY_CENTER} rotation={GALAXY_TILT} visible={visible}>
      <group ref={spinRef}>
        {/* 银河系与星云不参与点击：否则它们会拦截射向行星的射线 */}
        <points geometry={geo} frustumCulled={false} raycast={() => null}>
          <shaderMaterial
            ref={matRef}
            vertexShader={galaxyVertex}
            fragmentShader={galaxyFragment}
            uniforms={{ uTime: { value: 0 }, uScale: { value: uScale } }}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
        {NEBULAE.map((n, i) => (
          <sprite key={i} position={n.pos} scale={[n.scale, n.scale, 1]} raycast={() => null}>
            <spriteMaterial map={nebTex} color={n.color} transparent opacity={n.opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}

function Starfield({ count }: { count: number }) {
  const geo = useMemo(() => {
    const rand = mulberry32(42);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const cA = new THREE.Color("#ffffff");
    const cB = new THREE.Color("#bcd8ff");
    const cC = new THREE.Color("#ffd9a8");
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = 70 + rand() * 60;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const u = rand();
      tmp.copy(u < 0.7 ? cA : u < 0.9 ? cB : cC).multiplyScalar(0.55 + rand() * 0.45);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [count]);
  return (
    <points geometry={geo} raycast={() => null}>
      <pointsMaterial size={1.5} sizeAttenuation={false} vertexColors transparent opacity={0.9} />
    </points>
  );
}

// ---------- 相机 ----------
// 跟踪模式：相机绕太阳旋转被跟踪天体的轨道角变化（不是平移），
// 这样太阳相对相机的位置保持不变，地球始终以同样的昼夜面朝向相机
// （平移跟随会让地球公转一圈从白昼转到黑夜）。用户的拖拽/缩放偏移保留。
// 固定模式：相机飞到固定位姿。聚焦行星时跟随该行星。
function CameraRig({ mode, focus, earthPosRef, planetPositions }: {
  mode: Mode;
  focus: PlanetId | null;
  earthPosRef: RefObject<THREE.Vector3>;
  planetPositions: RefObject<Map<string, THREE.Vector3>>;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const transRef = useRef<{
    t: number; dur: number; fromPos: THREE.Vector3; fromTgt: THREE.Vector3; active: boolean;
  }>({ t: 0, dur: 1.4, fromPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(), active: false });
  const prevTracked = useRef(new THREE.Vector3());
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const tmp2 = useMemo(() => new THREE.Vector3(), []);

  const computeGoal = (m: Mode, f: PlanetId | null, out: { pos: THREE.Vector3; tgt: THREE.Vector3 }) => {
    if (f) {
      const p = planetPositions.current.get(f) ?? earthPosRef.current;
      const r = PLANET_MAP[f].radius;
      const dist = Math.max(r * 4, 2.5) + 1;
      tmp.copy(camera.position).sub(p);
      if (tmp.lengthSq() < 0.01) tmp.set(0, 1, 1);
      tmp.normalize().multiplyScalar(dist);
      out.pos.copy(p).add(tmp);
      out.tgt.copy(p);
      return;
    }
    const off = TRACK_OFFSETS[m];
    if (off) {
      out.pos.copy(earthPosRef.current).add(tmp2.set(off[0], off[1], off[2]));
      out.tgt.copy(earthPosRef.current);
      return;
    }
    const pose = FIXED_POSES[m];
    if (pose) {
      out.pos.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      out.tgt.set(pose.target[0], pose.target[1], pose.target[2]);
    }
  };

  const key = `${mode}:${focus ?? ""}`;
  useEffect(() => {
    const goal = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
    computeGoal(mode, focus, goal);
    transRef.current = {
      t: 0, dur: 1.4,
      fromPos: camera.position.clone(),
      fromTgt: controls ? (controls.target as THREE.Vector3).clone() : new THREE.Vector3(),
      active: true,
    };
    if (controls) controls.enabled = false;
    // 过渡结束后的跟随基准 = 当前被跟踪位置（避免第一帧跳变）
    const tracked = focus ? planetPositions.current.get(focus) : isTrackingMode(mode) ? earthPosRef.current : null;
    if (tracked) prevTracked.current.copy(tracked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useFrame((_, delta) => {
    if (!controls) return;
    const trans = transRef.current;
    if (trans.active) {
      trans.t += delta;
      const k = Math.min(1, trans.t / trans.dur);
      const e = easeInOutQuad(k);
      const goal = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
      computeGoal(mode, focus, goal);
      camera.position.lerpVectors(trans.fromPos, goal.pos, e);
      (controls.target as THREE.Vector3).lerpVectors(trans.fromTgt, goal.tgt, e);
      if (k >= 1) {
        trans.active = false;
        controls.enabled = true;
        const tracked = focus ? planetPositions.current.get(focus) : isTrackingMode(mode) ? earthPosRef.current : null;
        if (tracked) prevTracked.current.copy(tracked);
      }
      controls.update();
      return;
    }
    const tracked = focus ? planetPositions.current.get(focus) : isTrackingMode(mode) ? earthPosRef.current : null;
    if (tracked) {
      // 轨道角变化：被跟踪天体绕太阳转了多少，相机就绕太阳（原点）转多少。
      // 目标直接取天体当前位置（相机始终看向它）。
      const r = Math.hypot(tracked.x, tracked.z);
      const pr = Math.hypot(prevTracked.current.x, prevTracked.current.z);
      if (r > 0.5 && pr > 0.5) {
        let dAngle = Math.atan2(tracked.z, tracked.x) - Math.atan2(prevTracked.current.z, prevTracked.current.x);
        if (dAngle > Math.PI) dAngle -= Math.PI * 2;
        if (dAngle < -Math.PI) dAngle += Math.PI * 2;
        if (Math.abs(dAngle) > 1e-9) {
          const cos = Math.cos(dAngle), sin = Math.sin(dAngle);
          const px = camera.position.x, pz = camera.position.z;
          camera.position.x = px * cos - pz * sin;
          camera.position.z = px * sin + pz * cos;
        }
      }
      (controls.target as THREE.Vector3).copy(tracked);
      prevTracked.current.copy(tracked);
    }
    controls.update();
  });
  return null;
}

// ---------- 主组件 ----------
export default function SpaceCore({ planetSatellites }: { planetSatellites: Record<string, Satellite[]> }) {
  const [enabled, setEnabled] = useState(true);
  const [reason, setReason] = useState<"motion" | "webgl" | null>(null);
  const [mode, setMode] = useState<Mode>("universe");
  const [focus, setFocus] = useState<PlanetId | null>(null);
  const [motionPaused, setMotionPaused] = useState(false);
  const [earthSpinOn, setEarthSpinOn] = useState(true);
  const [hoveredSatellite, setHoveredSatellite] = useState<Satellite | null>(null);
  const [universeOpen, setUniverseOpen] = useState(false);
  const earthPosRef = useRef(new THREE.Vector3(6.4, 0, -6.4));
  const planetPositions = useRef(new Map<string, THREE.Vector3>());
  const modeRef = useRef<Mode>("universe");
  const prevModeRef = useRef<Mode>("universe");
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // 双形态切换：进入宇宙模式时相机拉远到太阳系视角，退出时恢复之前的模式。
  // 同一个 Canvas / 同一个场景实例，只改模式与面板状态。
  useEffect(() => {
    const handler = (e: Event) => {
      const open = (e as CustomEvent<{ open: boolean }>).detail?.open;
      if (open) {
        prevModeRef.current = modeRef.current;
        setMode("solar");
        setFocus(null);
        setUniverseOpen(true);
      } else {
        setMode(prevModeRef.current);
        setFocus(null);
        setUniverseOpen(false);
      }
    };
    window.addEventListener("outai:universe", handler);
    return () => window.removeEventListener("outai:universe", handler);
  }, []);

  const low = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) <= 4;
  }, []);

  useEffect(() => {
    const reduced = document.documentElement.dataset.motion === "reduced";
    if (reduced) { setEnabled(false); setReason("motion"); return; }
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) { setEnabled(false); setReason("webgl"); return; }
    setEnabled(true); setReason(null);
  }, []);

  useEffect(() => {
    const el = document.getElementById("core-fallback");
    if (!el) return;
    if (!enabled) {
      el.hidden = false;
      el.textContent = reason === "motion" ? "3D 核心已关闭 · 动效已关，页脚可开启" : "WEBGL UNAVAILABLE · 使用轻量模式";
    } else {
      el.hidden = true;
    }
  }, [enabled, reason]);

  const labelsVisible = mode === "universe" || mode === "navigation" || mode === "solar";
  const orbitsVisible = mode === "universe" || mode === "navigation" || mode === "solar";
  // 标签按相机距离缩放（宽视角下字太小看不清）：UNIVERSE 10 / NAVIGATION 18 / SOLAR 40。
  const labelDistanceFactor = mode === "solar" ? 40 : mode === "navigation" ? 18 : 10;
  // UNIVERSE 总览下标签只显示名称（水星/金星标签在太阳附近重叠）。
  const compactLabels = mode === "universe";
  const focusedPlanet = focus ? PLANET_MAP[focus] : null;
  const focusedSatellites = focus ? (planetSatellites[focus] ?? []) : [];

  const selectPlanet = (id: PlanetId) => {
    // 再次点击已聚焦的行星 = 直接进入对应页面
    if (focus === id) { go(PLANET_MAP[id].path); return; }
    setFocus(id);
  };

  if (!enabled) return null;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 45, near: 0.1, far: 600, position: [0, 2.5, 12] }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.3} />
        <Suspense fallback={null}>
          {/* 银河系在 SOLAR SYSTEM 模式下隐藏（会叠在太阳和内行星上面）；
              只改图层显隐，不重建场景 */}
          <Galaxy count={low ? 12000 : 30000} motionPaused={motionPaused} visible={mode !== "solar"} />
          <Starfield count={low ? 700 : 1600} />
          <SolarSystem
            planetSatellites={planetSatellites}
            motionPaused={motionPaused}
            earthSpinOn={earthSpinOn}
            labelsVisible={labelsVisible}
            orbitsVisible={orbitsVisible}
            labelDistanceFactor={labelDistanceFactor}
            compactLabels={compactLabels}
            focusedId={focus}
            low={low}
            earthPosRef={earthPosRef}
            planetPositions={planetPositions}
            onSelect={selectPlanet}
            onSatelliteHover={setHoveredSatellite}
            onSatelliteClick={(sat) => go(sat.path)}
          />
        </Suspense>
        <CameraRig mode={mode} focus={focus} earthPosRef={earthPosRef} planetPositions={planetPositions} />
        <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.55} zoomSpeed={0.8} minDistance={2.3} maxDistance={120} />
      </Canvas>

      <PlanetInfoPanel
        planet={focusedPlanet}
        satellites={focusedSatellites}
        hoveredSatellite={hoveredSatellite}
        onClose={() => setFocus(null)}
      />

      <div className="galaxy-panel" role="group" aria-label="观察模式">
        <div className="galaxy-status">{universeOpen ? "● UNIVERSE MODE" : "● OUTAI UNIVERSE"}{focusedPlanet ? ` · ${focusedPlanet.name}` : ""}</div>
        <div className="galaxy-panel-row">
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m && !focus ? "active" : ""}
              onClick={() => { setMode(m); setFocus(null); }}
              aria-pressed={mode === m && !focus}
            >
              {MODE_LABELS[m].icon} {MODE_LABELS[m].label}
            </button>
          ))}
        </div>
        <div className="galaxy-panel-row galaxy-panel-controls">
          <button type="button" onClick={() => { setMode("universe"); setFocus(null); }} aria-label="回到宇宙总览">⟲</button>
          <button type="button" onClick={() => setMotionPaused((v) => !v)} aria-pressed={motionPaused}>
            {motionPaused ? "▶ 运动" : "⏸ 运动"}
          </button>
          <button type="button" onClick={() => setEarthSpinOn((v) => !v)} aria-pressed={!earthSpinOn}>
            自转：{earthSpinOn ? "开" : "关"}
          </button>
          {universeOpen && (
            <button type="button" className="universe-exit" onClick={() => window.dispatchEvent(new CustomEvent("outai:universe-close"))}>
              ✕ 退出宇宙
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
