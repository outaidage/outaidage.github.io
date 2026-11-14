// SpaceCore.tsx — Galaxy Explorer：真实 3D 地球 + 程序化螺旋银河系（R3F + Drei）。
// 中央：NASA Visible Earth 贴图的真实地球（大陆/海洋/云层/大气/昼夜交界/夜灯光），
// 外围：程序化粒子螺旋银河（核心、4 条旋臂、蓝紫星云、星际尘埃、三维纵深），
// 同一场景内四种观察模式（UNIVERSE / EARTH / GALAXY / NAVIGATION）平滑切换相机。
// 地球纹理来自 three.js 官方示例同款（NASA Visible Earth，公共领域），托管在
// public/textures/earth/，不依赖外链。
// 动效规则与全站一致：无存储偏好时默认开，只有页脚明确关掉（存 "reduced"）才关；
// 手机与低性能设备自动降级（银河粒子减半、DPR 1）。
// 加载方式：首页 `client:idle`，不要用 `client:visible`（本组件服务端渲染为 null，
// visible 指令观测不到子节点，永远不会水合）。
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import type { PlanetNode } from "@/lib/home-modules";

const EARTH_RADIUS = 1.6;
/** 太阳方向（世界坐标；与 DirectionalLight 位置一致，左上为白昼）。 */
const SUN_DIR = new THREE.Vector3(-5, 2.5, 5).normalize();
/** 银河中心（相对地球略偏右下，让亮核不在地球正后方）。 */
const GALAXY_CENTER: [number, number, number] = [5, -1.5, -5];
/** 银河盘面倾角：接近侧视呈斜向星带（与参考图一致），GALAXY 模式再从上方看旋臂。 */
const GALAXY_TILT: [number, number, number] = [-1.15, 0, 0.45];

type GalaxyMode = "universe" | "earth" | "galaxy" | "navigation";

const MODES: Record<
  GalaxyMode,
  { label: string; icon: string; desc: string; camera: [number, number, number]; target: [number, number, number] }
> = {
  universe: { label: "UNIVERSE", icon: "◎", desc: "地球与银河同框", camera: [0, 1.2, 7.5], target: [0, 0, 0] },
  earth: { label: "EARTH", icon: "◉", desc: "贴近地球看大陆、云层与大气", camera: [0, 0.8, 3.4], target: [0, 0, 0] },
  galaxy: { label: "GALAXY", icon: "✦", desc: "拉远看完整螺旋星系", camera: [0, 42, 58], target: [5, -1.5, -5] },
  navigation: { label: "NAVIGATION", icon: "⬡", desc: "地球居中，全部功能节点", camera: [0, 1.5, 9.5], target: [0, 0, 0] },
};

type ControlsHandle = { target: THREE.Vector3; enabled: boolean; update: () => void };

// ---------- 小工具：确定性随机（银河每次加载长得一样） ----------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand: () => number) {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

// ---------- 地球贴图 ----------
function useEarthTextures() {
  const base = import.meta.env.BASE_URL;
  const [day, normal, specular, clouds, lights] = useTexture([
    `${base}textures/earth/earth_atmos_2048.jpg`,
    `${base}textures/earth/earth_normal_2048.jpg`,
    `${base}textures/earth/earth_specular_2048.jpg`,
    `${base}textures/earth/earth_clouds_1024.png`,
    `${base}textures/earth/earth_lights_2048.png`,
  ]);
  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    clouds.colorSpace = THREE.SRGBColorSpace;
    lights.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = 4;
  }, [day, clouds, lights]);
  return { day, normal, specular, clouds, lights };
}

// ---------- 夜灯光材质：只在夜半球显示城市灯光 ----------
function makeLightsMaterial(lights: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { lightsMap: { value: lights }, sunDir: { value: SUN_DIR } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D lightsMap;
      uniform vec3 sunDir;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        float ndl = dot(normalize(vWorldNormal), normalize(sunDir));
        float night = smoothstep(0.08, -0.12, ndl);
        vec3 c = texture2D(lightsMap, vUv).rgb;
        gl_FragColor = vec4(c * night * 1.6, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// ---------- 大气层：背面菲涅尔辉光 ----------
function makeAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
        gl_FragColor = vec4(0.35, 0.75, 1.0, 1.0) * intensity;
      }`,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
}

// ---------- 地球：表面 + 夜灯光 + 云层（独立转动） + 大气 ----------
function Earth() {
  const tex = useEarthTextures();
  const earthRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const lightsMat = useMemo(() => makeLightsMaterial(tex.lights), [tex.lights]);
  const atmoMat = useMemo(() => makeAtmosphereMaterial(), []);
  useFrame((_, delta) => {
    if (earthRef.current) earthRef.current.rotation.y += delta * 0.02;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.008;
  });
  return (
    <group ref={earthRef}>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshPhongMaterial
          map={tex.day}
          normalMap={tex.normal}
          specularMap={tex.specular}
          specular={new THREE.Color("#4a4a4a")}
          shininess={18}
        />
      </mesh>
      <mesh material={lightsMat} scale={1.004} renderOrder={1}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      </mesh>
      <mesh ref={cloudsRef} scale={1.02} renderOrder={2}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshLambertMaterial map={tex.clouds} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh material={atmoMat} scale={1.18} renderOrder={3}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      </mesh>
    </group>
  );
}

// ---------- 银河系：程序化粒子 ----------
// 星云光斑（柔光贴图 + Sprite）。
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(c);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.35, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// 星云团位置（银河盘面局部坐标，随旋臂一起缓慢转动）。
const NEBULAE: { pos: [number, number, number]; color: string; scale: number; opacity: number }[] = [
  { pos: [0, 0, 0], color: "#ffb36b", scale: 20, opacity: 0.26 },
  { pos: [12, 0.5, 6], color: "#4d7cfe", scale: 22, opacity: 0.16 },
  { pos: [-14, -0.5, 10], color: "#8b5cf6", scale: 24, opacity: 0.15 },
  { pos: [20, 0, -8], color: "#61edff", scale: 18, opacity: 0.13 },
  { pos: [-8, 1, -16], color: "#4d7cfe", scale: 20, opacity: 0.14 },
  { pos: [26, -1, 4], color: "#8b5cf6", scale: 22, opacity: 0.13 },
  { pos: [-22, 0.5, -6], color: "#4d7cfe", scale: 18, opacity: 0.13 },
  { pos: [8, -1, 20], color: "#a68aff", scale: 20, opacity: 0.12 },
];

function buildGalaxy(count: number) {
  const rand = mulberry32(1337);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const cCore = new THREE.Color("#ffe9b8");
  const cWarm = new THREE.Color("#ffb36b");
  const cMid = new THREE.Color("#cfe4ff");
  const cOuter = new THREE.Color("#a68aff");
  let i = 0;
  // 核心：致密核球（28%）。
  const coreCount = Math.floor(count * 0.28);
  for (; i < coreCount; i++) {
    const r = Math.abs(gauss(rand)) * 5.5;
    const a = rand() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = gauss(rand) * 1.1 * (1 - r / 8);
    positions[i * 3 + 2] = Math.sin(a) * r;
    const c = cCore.clone().lerp(cWarm, rand() * 0.5);
    const b = 0.65 + rand() * 0.35;
    colors[i * 3] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;
    sizes[i] = 0.1 + rand() * 0.22;
    phases[i] = rand();
  }
  // 旋臂：4 条对数螺旋，越往外越稀薄、越偏蓝紫。
  const arms = 4;
  for (; i < count; i++) {
    const arm = i % arms;
    const armOffset = (arm / arms) * Math.PI * 2;
    const r = 2 + Math.pow(rand(), 0.65) * 33;
    const spread = gauss(rand) * Math.max(1.6 - r * 0.035, 0.35);
    const angle = armOffset + r * 0.135 + spread * 0.35;
    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = gauss(rand) * (2.0 * (1 - r / 38) + 0.3);
    positions[i * 3 + 2] = Math.sin(angle) * r;
    const t = Math.min(r / 35, 1);
    const c = t < 0.45 ? cWarm.clone().lerp(cMid, t / 0.45) : cMid.clone().lerp(cOuter, (t - 0.45) / 0.55);
    const b = 0.45 + rand() * 0.55;
    colors[i * 3] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;
    sizes[i] = (0.05 + rand() * 0.17) * (1.15 - t * 0.45);
    phases[i] = rand();
  }
  return { positions, colors, sizes, phases };
}

function makeGalaxyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 } },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.72 + 0.28 * sin(uTime * 0.9 + aPhase * 6.2831);
        vTwinkle = tw;
        float size = aSize * uScale * tw / max(-mv.z, 0.1);
        gl_PointSize = min(size, 18.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.08, d) * vTwinkle;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function Galaxy({ quality }: { quality: "high" | "low" }) {
  const spinRef = useRef<THREE.Group>(null);
  const count = quality === "high" ? 30000 : 12000;
  const data = useMemo(() => buildGalaxy(count), [count]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(data.colors, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(data.phases, 1));
    return g;
  }, [data]);
  const material = useMemo(() => makeGalaxyMaterial(), []);
  const glowTex = useMemo(() => makeGlowTexture(), []);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  useEffect(() => {
    material.uniforms.uScale.value = (size.height * dpr * 0.5) / Math.tan(THREE.MathUtils.degToRad(22.5));
  }, [size, dpr, material]);
  useFrame((state, delta) => {
    if (spinRef.current) spinRef.current.rotation.y += delta * 0.008;
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <group position={GALAXY_CENTER} rotation={GALAXY_TILT}>
      <group ref={spinRef}>
        <points geometry={geometry} material={material} frustumCulled={false} />
        {NEBULAE.map((n, i) => (
          <sprite key={i} position={n.pos} scale={[n.scale, n.scale, 1]}>
            <spriteMaterial
              map={glowTex}
              color={n.color}
              transparent
              opacity={n.opacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        ))}
      </group>
    </group>
  );
}

// ---------- 背景星空：远处球壳上的恒星 ----------
function Starfield({ quality }: { quality: "high" | "low" }) {
  const count = quality === "high" ? 1600 : 700;
  const geometry = useMemo(() => {
    const rand = mulberry32(42);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
        .normalize()
        .multiplyScalar(70 + rand() * 60);
      pos[k * 3] = v.x;
      pos[k * 3 + 1] = v.y;
      pos[k * 3 + 2] = v.z;
      const b = 0.4 + rand() * 0.6;
      const tint = rand();
      const c =
        tint < 0.7
          ? new THREE.Color(1, 1, 1)
          : tint < 0.85
            ? new THREE.Color(0.75, 0.85, 1)
            : new THREE.Color(1, 0.9, 0.75);
      col[k * 3] = c.r * b;
      col[k * 3 + 1] = c.g * b;
      col[k * 3 + 2] = c.b * b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [count]);
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={1.5} sizeAttenuation={false} vertexColors transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

// ---------- 功能节点对应的 3D 卫星 ----------
// 与 HTML 节点同轨道、同角速度（度/秒），轨道带 z 向倾斜以免穿过地球。
const SAT_ORBIT_R: Record<number, number> = { 1: 2.21, 2: 2.73, 3: 3.17 };
const SAT_SPEED: Record<number, number> = { 1: 6, 2: 4, 3: 2.5 };

function NodeSatellites({ nodes }: { nodes: PlanetNode[] }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((child, idx) => {
      const n = nodes[idx];
      if (!n) return;
      const r = SAT_ORBIT_R[n.orbit || 1] ?? 2.73;
      const speed = THREE.MathUtils.degToRad(SAT_SPEED[n.orbit || 1] ?? 4);
      const a = THREE.MathUtils.degToRad(n.computedAngle) + speed * t;
      child.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.62, Math.sin(a) * r * 0.5);
    });
  });
  return (
    <group ref={groupRef}>
      {nodes.map((n) => (
        <group key={n.id}>
          <mesh>
            <octahedronGeometry args={[0.07, 0]} />
            <meshBasicMaterial color={n.theme_color || "#61EDFF"} toneMapped={false} />
          </mesh>
          <mesh rotation={[Math.PI / 2.5, 0.4, 0]}>
            <torusGeometry args={[0.13, 0.008, 8, 32]} />
            <meshBasicMaterial color={n.theme_color || "#61EDFF"} transparent opacity={0.7} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------- 相机：模式切换时平滑过渡（缓动 1.4s），过渡期间禁用拖拽 ----------
function CameraRig({
  mode,
  controlsRef,
}: {
  mode: GalaxyMode;
  controlsRef: MutableRefObject<ControlsHandle | null>;
}) {
  const camera = useThree((s) => s.camera);
  const animRef = useRef<{
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
  } | null>(null);
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    const m = MODES[mode];
    const c = controlsRef.current;
    animRef.current = {
      fromPos: camera.position.clone(),
      fromTarget: c ? c.target.clone() : new THREE.Vector3(0, 0, 0),
      toPos: new THREE.Vector3(...m.camera),
      toTarget: new THREE.Vector3(...m.target),
      t: 0,
    };
    if (c) c.enabled = false;
  }, [mode, camera, controlsRef]);
  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim) return;
    anim.t = Math.min(anim.t + delta / 1.4, 1);
    const e = anim.t < 0.5 ? 2 * anim.t * anim.t : 1 - Math.pow(-2 * anim.t + 2, 2) / 2;
    camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
    const c = controlsRef.current;
    if (c) {
      c.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
      c.update();
    }
    if (anim.t >= 1) {
      animRef.current = null;
      if (c) c.enabled = true;
    }
  });
  return null;
}

export default function SpaceCore({ nodes = [] }: { nodes?: PlanetNode[] }) {
  // Start disabled so the server render and the first client render agree
  // (null); the real check runs once after mount, client-side only.
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<GalaxyMode>("universe");
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");
  const controlsRef = useRef<ControlsHandle | null>(null);
  // 手机或低核设备自动降级：银河粒子减半（3 万 → 1.2 万）、背景星减半。
  const [quality] = useState<"high" | "low">(() =>
    typeof window === "undefined"
      ? "high"
      : window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4
        ? "low"
        : "high",
  );

  useEffect(() => {
    // 与 MainLayout 的 isReduced 同一规则：无存储偏好时动效开，只有显式
    // 存了 "reduced" 才关（无痕模式不再因系统减动效而误关）。
    const stored = document.documentElement.dataset.motion;
    const reducedMotion = stored === "reduced";
    // WebGL 预检：建不出 WebGL 上下文就留在轻量模式，并说明原因。
    let webglOk = false;
    try {
      const probe = document.createElement("canvas");
      webglOk = !!(probe.getContext("webgl2") || probe.getContext("webgl"));
    } catch {
      webglOk = false;
    }
    const ok = !reducedMotion && webglOk;
    setEnabled(ok);
    if (!ok) {
      const el = document.getElementById("core-fallback");
      if (el) {
        el.removeAttribute("hidden");
        el.textContent = !webglOk
          ? "WEBGL UNAVAILABLE · 使用轻量模式"
          : "3D 核心已关闭 · 动效已关，页脚可开启";
      }
    }
  }, []);

  // 标签页切到后台时暂停渲染，切回来恢复。
  useEffect(() => {
    const onVisibility = () => setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // 模式变化通知 PlanetNodes（EARTH / GALAXY 模式下隐藏 HTML 节点）。
  useEffect(() => {
    document.documentElement.dataset.galaxyMode = mode;
    window.dispatchEvent(new CustomEvent("galaxy-mode", { detail: mode }));
  }, [mode]);

  if (!enabled) return null;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        frameloop={frameloop}
        dpr={[1, 1.5]}
        camera={{ position: MODES.universe.camera, fov: 45, near: 0.1, far: 600 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.15} />
        <directionalLight position={[SUN_DIR.x * 10, SUN_DIR.y * 10, SUN_DIR.z * 10]} intensity={1.8} />
        <Suspense fallback={null}>
          <Earth />
          <Galaxy quality={quality} />
          <Starfield quality={quality} />
          <NodeSatellites nodes={nodes} />
        </Suspense>
        <OrbitControls
          makeDefault
          ref={(c) => {
            controlsRef.current = c as unknown as ControlsHandle | null;
          }}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.55}
          zoomSpeed={0.8}
          minDistance={2.3}
          maxDistance={120}
        />
        <CameraRig mode={mode} controlsRef={controlsRef} />
      </Canvas>
      <div className="galaxy-panel" role="group" aria-label="观察模式">
        <span className="galaxy-panel-status">
          <span className="pulse" /> GALAXY EXPLORER
        </span>
        <div className="galaxy-panel-modes">
          {(Object.keys(MODES) as GalaxyMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? "active" : ""}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              title={MODES[m].desc}
            >
              <span aria-hidden="true">{MODES[m].icon}</span> {MODES[m].label}
            </button>
          ))}
          <button type="button" className="reset" onClick={() => setMode("universe")} title="回到默认视角">
            ⟲
          </button>
        </div>
      </div>
    </div>
  );
}
