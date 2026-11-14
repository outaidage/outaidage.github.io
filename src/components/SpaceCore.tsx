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

// 深空星云（电影级开场用）：数团巨大、极柔和的星云，分布在太阳系之外
// 的深空（距原点 60–120 单位）。开场镜头从深空出发时它们构成空间纵深；
// 正常总览下只是远处淡淡的背景云，不干扰行星与导航。复用银河的星云纹理。
const DEEP_NEBULAE: { color: string; pos: [number, number, number]; scale: number; opacity: number }[] = [
  { color: "#61edff", pos: [-70, 25, 60], scale: 90, opacity: 0.13 },
  { color: "#a68aff", pos: [80, -15, 40], scale: 110, opacity: 0.11 },
  { color: "#4d7cfe", pos: [10, 45, -70], scale: 100, opacity: 0.12 },
  { color: "#ffb36b", pos: [-40, -30, -80], scale: 80, opacity: 0.08 },
  { color: "#7dffce", pos: [60, 30, 90], scale: 70, opacity: 0.07 },
];
function DeepNebula() {
  const nebTex = useMemo(nebulaTexture, []);
  return (
    <group>
      {DEEP_NEBULAE.map((n, i) => (
        <sprite key={i} position={n.pos} scale={[n.scale, n.scale, 1]} raycast={() => null}>
          <spriteMaterial map={nebTex} color={n.color} transparent opacity={n.opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      ))}
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

// ---------- 电影级开场飞行 ----------
// 镜头在现有 3D 太阳系场景内连续飞行（不新建场景、不换页）：深空星云 →
// 掠过木星、土星 → 太阳能量核心 → 无缝进入现有总览。BootIntro（DOM 覆盖层）
// 与 CameraRig（3D 相机）之间用 window 事件通信（事件名与 BootIntro 内
// 的字面量一致）；再加 window.__outaiBootFly 标志兜底（两者挂载顺序不确定）。
// 注意：飞行常量与函数直接写在本文件（不从 @/lib/boot-flight 导入——
// 该模块在岛屿打包时未被正确内联进 SpaceCore 包，引用会成自由变量）。
const BOOT_FLY = "outai:boot-fly";
const BOOT_SKIP = "outai:boot-skip";
const BOOT_CORE = "outai:boot-core"; // 到达能量核心 → 品牌淡入
const BOOT_ENTER = "outai:boot-enter"; // 进入主场景 → 品牌淡出 + 舞台收回
const BOOT_CAMERA_DONE = "outai:boot-camera-done"; // 相机到达总览
const SCENE_READY = "outai:scene-ready"; // Canvas 渲染出第一帧 → BootIntro 再全屏+起飞（避免黑屏起手）
// 深空起点：相机初始位置。Boot 播放时 Canvas 直接用此位置创建相机，
// 第一帧就是深空，不会先出现总览再跳变。
const FLIGHT_START: [number, number, number] = [0, 16, 120];
// 飞越巨行星时的侧向距离（相机与行星中心的距离；木星半径 2.3、土星环外缘 4.4）
const JUPITER_FLYBY = 6.5;
const SATURN_FLYBY = 8;

function tangentialOffset(planetPos: THREE.Vector3, dist: number, up: number): THREE.Vector3 {
  // 从太阳指向行星的径向取切向（绕 Y 轴转 90°），相机从行星侧面掠过，
  // 而不是迎头撞上；再抬高一点，带出纵深。
  const radial = new THREE.Vector3(planetPos.x, 0, planetPos.z).normalize();
  const tangent = new THREE.Vector3(-radial.z, 0, radial.x);
  return planetPos.clone().add(tangent.multiplyScalar(dist)).add(new THREE.Vector3(0, up, 0));
}

// 构建飞行航线（Catmull-Rom 样条，连续平滑）。巨行星位置直接按
// PLANET_MAP 的轨道参数算（orbitRadius + initialAngle，x = r·cos a，
// z = r·sin a，与行星实际位置公式一致）：飞行在挂载后立刻开始，行星
// 公转很慢，起飞时它们基本还在初始角附近；用配置算比等 planetPositions
// 更可靠（第一帧时 planetPositions 可能还没写入，兜底点又不在行星附近，
// 会导致镜头掠过空无一物的深空、看不到木星/土星）。
function buildFlightCurve(earthPos: THREE.Vector3): THREE.CatmullRomCurve3 {
  const planetPos = (id: PlanetId): THREE.Vector3 => {
    const def = PLANET_MAP[id];
    return new THREE.Vector3(
      Math.cos(def.initialAngle) * def.orbitRadius,
      0,
      Math.sin(def.initialAngle) * def.orbitRadius,
    );
  };
  const pts: THREE.Vector3[] = [new THREE.Vector3(...FLIGHT_START)];
  pts.push(tangentialOffset(planetPos("jupiter"), JUPITER_FLYBY, 2.5));
  pts.push(tangentialOffset(planetPos("saturn"), SATURN_FLYBY, 2));
  // 接近能量核心（太阳）
  pts.push(new THREE.Vector3(9, 3, 16));
  pts.push(new THREE.Vector3(4, 1.5, 8.5));
  // 进入总览（地球 + UNIVERSE 模式偏移，与正常总览完全一致）
  pts.push(earthPos.clone().add(new THREE.Vector3(0, 2.5, 12)));
  return new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
}

// 电影级缓动：慢起（深空展开）— 快中段（穿越）— 慢收（抵达核心、进入总览）
function easeFlight(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// 视线过渡：t 在 0.72→1.0 之间从太阳（能量核心）平滑转到地球（总览目标）
function lookBlend(t: number): number {
  const s = (t - 0.72) / 0.28;
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  return s * s * (3 - 2 * s);
}

// 关键时刻（按缓动后的进度 e 计）
const CORE_AT = 0.48; // 到达能量核心附近 → 品牌淡入（早一点，太阳还在画面中央时）
const ENTER_AT = 0.85; // 进入主场景 → 品牌淡出 + 舞台收回

// ---------- 相机 ----------
// 跟踪模式：相机绕太阳旋转被跟踪天体的轨道角变化（不是平移），
// 这样太阳相对相机的位置保持不变，地球始终以同样的昼夜面朝向相机
// （平移跟随会让地球公转一圈从白昼转到黑夜）。用户的拖拽/缩放偏移保留。
// 固定模式：相机飞到固定位姿。聚焦行星时跟随该行星。
function CameraRig({ mode, focus, resetKey, earthPosRef, planetPositions }: {
  mode: Mode;
  focus: PlanetId | null;
  resetKey: number;
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

  // ---- 电影级开场飞行 ----
  // 镜头沿 Catmull-Rom 航线连续飞行：深空 → 掠过木星/土星 → 太阳能量核心
  // → 无缝进入现有总览。飞行期间接管相机（禁用 OrbitControls），结束时
  // 交还控制，相机已在总览位置，与正常总览完全一致。
  const flightRef = useRef<{
    active: boolean; t: number; dur: number;
    curve: THREE.CatmullRomCurve3 | null;
    coreFired: boolean; enterFired: boolean;
  }>({ active: false, t: 0, dur: 6.5, curve: null, coreFired: false, enterFired: false });
  const sunPos = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const sceneReadyRef = useRef(false);
  const bootPlay = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (window as unknown as { __outaiBoot?: { play?: boolean } }).__outaiBoot?.play === true;
  }, []);

  const startFlight = (dur: number) => {
    if (flightRef.current.active) return; // 已在飞，忽略重复触发
    transRef.current.active = false; // 取消普通过渡，飞行接管相机
    if (controls) controls.enabled = false;
    flightRef.current = { active: true, t: 0, dur, curve: null, coreFired: false, enterFired: false };
    // 相机已在深空起点（Canvas 初始位置）；若不是（例如重播时），贴到起点。
    // 第一帧就是深空，不会先出现总览再跳变。
    camera.position.set(FLIGHT_START[0], FLIGHT_START[1], FLIGHT_START[2]);
    if (controls) (controls.target as THREE.Vector3).copy(sunPos);
  };

  const endFlight = () => {
    const f = flightRef.current;
    if (!f.active) return;
    f.active = false;
    // 落到总览（UNIVERSE 目标），交还控制。飞行结束时相机已在总览位置，
    // 这里只是对齐（跳过时则是直接贴到总览）。
    const goal = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
    computeGoal("universe", null, goal);
    camera.position.copy(goal.pos);
    if (controls) (controls.target as THREE.Vector3).copy(goal.tgt);
    if (controls) controls.enabled = true;
    const tracked = earthPosRef.current;
    if (tracked) prevTracked.current.copy(tracked);
    window.dispatchEvent(new CustomEvent(BOOT_CAMERA_DONE));
  };

  // 飞行触发：BootIntro 的事件；挂载兜底（BootIntro 先跑了，flag 已置）；
  // 2.5 秒兜底（事件与 flag 都错过时，首次访问仍要起飞，绝不停在深空）。
  useEffect(() => {
    const onFly = () => {
      const isMobile = window.innerWidth < 760;
      startFlight(isMobile ? 4.6 : 6.5);
    };
    const onSkip = () => { if (flightRef.current.active) endFlight(); };
    window.addEventListener(BOOT_FLY, onFly);
    window.addEventListener(BOOT_SKIP, onSkip);
    if ((window as unknown as { __outaiBootFly?: boolean }).__outaiBootFly) onFly();
    const failsafe = window.setTimeout(() => {
      if (bootPlay && !flightRef.current.active) onFly();
    }, 2500);
    return () => {
      window.removeEventListener(BOOT_FLY, onFly);
      window.removeEventListener(BOOT_SKIP, onSkip);
      window.clearTimeout(failsafe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const startTransition = () => {
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
  };

  const key = `${mode}:${focus ?? ""}`;
  useEffect(() => {
    // 开场飞行接管相机时不做普通过渡（飞机会把相机带到总览）。
    if (bootPlay) return;
    startTransition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 返回首页复位：浏览器返回键 / 视图切换恢复页面时，相机可能仍停在
  // 之前放大的行星上，而模式与焦点状态已回到默认（面板消失），看起来
  // 就像界面点不动。resetKey 变化时直接贴合回宇宙总览（不经过渡动画，
  // 过渡可能因状态已是默认而不触发——第 4 轮证实过渡版复位无效）。
  useEffect(() => {
    if (resetKey <= 0) return;
    const goal = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
    computeGoal("universe", null, goal);
    camera.position.copy(goal.pos);
    if (controls) (controls.target as THREE.Vector3).copy(goal.tgt);
    transRef.current.active = false;
    if (controls) { controls.enabled = true; controls.update(); }
    prevTracked.current.copy(earthPosRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // 挂载兜底：若恢复后的相机远离总览（返回导航的旧视角），且当前是默认
  // 总览、无聚焦，直接贴到总览。首次加载时相机离总览约 9 单位，不触发；
  // 只有返回后残留的放大视角（离总览 12 单位以上）会触发。开场飞行期间
  // 不兜底（飞行接管相机）。
  useEffect(() => {
    if (bootPlay) return;
    if (mode !== "universe" || focus) return;
    const goal = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
    computeGoal("universe", null, goal);
    if (camera.position.distanceTo(goal.pos) > 12) {
      camera.position.copy(goal.pos);
      if (controls) (controls.target as THREE.Vector3).copy(goal.tgt);
      transRef.current.active = false;
      if (controls) { controls.enabled = true; controls.update(); }
      prevTracked.current.copy(earthPosRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    if (!controls) return;
    // 场景就绪：第一帧已渲染，通知 BootIntro 可以全屏+起飞（避免黑屏起手）。
    // 只发一次。BootIntro 若 2.5 秒内没收到也会超时继续，不会卡住。
    if (!sceneReadyRef.current) {
      sceneReadyRef.current = true;
      window.dispatchEvent(new CustomEvent(SCENE_READY));
    }
    // ---- 电影级开场飞行（优先于普通过渡与跟随） ----
    const f = flightRef.current;
    if (f.active) {
      // 首次帧：构建航线（行星位置按配置算，不依赖 planetPositions 的写入时机）。
      if (!f.curve) f.curve = buildFlightCurve(earthPosRef.current);
      f.t += delta / f.dur;
      const t = Math.min(1, f.t);
      const e = easeFlight(t);
      camera.position.copy(f.curve.getPoint(e));
      // 视线：大部分时间看太阳（能量核心），末段平滑转到地球（总览目标）。
      const b = lookBlend(e);
      lookTarget.copy(sunPos).lerp(earthPosRef.current, b);
      (controls.target as THREE.Vector3).copy(lookTarget);
      // 关键时刻事件（只发一次）：品牌淡入 / 进入主场景。
      if (!f.coreFired && e >= CORE_AT) { f.coreFired = true; window.dispatchEvent(new CustomEvent(BOOT_CORE)); }
      if (!f.enterFired && e >= ENTER_AT) { f.enterFired = true; window.dispatchEvent(new CustomEvent(BOOT_ENTER)); }
      controls.update();
      if (t >= 1) endFlight();
      return;
    }
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
  const [resetKey, setResetKey] = useState(0);
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

  // 返回首页时复位到总览：浏览器返回键会从缓存恢复页面，相机仍停在
  // 之前放大的行星上、而 React 的 focus 状态已重置（面板消失），手机上
  // 整屏是一颗行星、看不到其他行星，点来点去没有反应。pageshow（缓存恢复）
  // 与 astro:page-load（视图切换返回）都触发复位；首次加载时相机本就在
  // 总览，复位过渡是空操作，不影响正常进入。
  useEffect(() => {
    const reset = () => {
      setFocus(null);
      setMode("universe");
      setResetKey((k) => k + 1);
    };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) reset(); };
    const onPageLoad = () => reset();
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("astro:page-load", onPageLoad);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("astro:page-load", onPageLoad);
    };
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

  const labelsVisible = (mode === "universe" || mode === "navigation" || mode === "solar") && focus === null;
  // 聚焦时隐藏全部标签：相机靠近被聚焦行星时，附近行星的 Html 标签
  // 也会因 distanceFactor 放大成横贯全屏的横幅；信息面板已显示聚焦行星。
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

  // 首次访问播开场时，Canvas 相机直接创建在深空起点（第一帧就是深空，
  // 不会先出现总览再跳变）；否则用正常总览位置。
  const bootPlayCanvas = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (window as unknown as { __outaiBoot?: { play?: boolean } }).__outaiBoot?.play === true;
  }, []);

  if (!enabled) return null;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 45, near: 0.1, far: 600, position: bootPlayCanvas ? [...FLIGHT_START] : [0, 2.5, 12] }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.3} />
        <Suspense fallback={null}>
          {/* 银河系在 SOLAR SYSTEM 模式下隐藏（会叠在太阳和内行星上面）；
              只改图层显隐，不重建场景 */}
          <Galaxy count={low ? 12000 : 30000} motionPaused={motionPaused} visible={mode !== "solar"} />
          <Starfield count={low ? 700 : 1600} />
          <DeepNebula />
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
        <CameraRig mode={mode} focus={focus} resetKey={resetKey} earthPosRef={earthPosRef} planetPositions={planetPositions} />
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
          <button type="button" onClick={() => { setMode("universe"); setFocus(null); setResetKey((k) => k + 1); }} aria-label="回到宇宙总览">⟲</button>
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
