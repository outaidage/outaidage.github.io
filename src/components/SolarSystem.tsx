// SolarSystem.tsx — OUTAI 3D 宇宙：太阳 + 八大行星 + 卫星子功能。
// 全部属于同一个 R3F 场景，与地球、银河系共存。行星围绕太阳真实公转
// （3D 坐标计算，不是屏幕平移），卫星是行星组的子对象（随行星公转，
// 围绕行星运行）。点击行星聚焦 + 打开信息面板，点击卫星直接进入对应页面。
// 地球使用最高精度模型（NASA 贴图 + 云层 + 大气 + 夜灯光），其余行星
// 用程序化纹理或真实贴图（见 src/lib/planets.ts 的来源说明）。

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, useTexture } from "@react-three/drei";
import { PLANETS, PLANET_MAP, satelliteOrbitRadius, type PlanetDef, type PlanetId, type Satellite } from "@/lib/planets";
import { getProceduralTexture, getSaturnRingTexture } from "@/lib/planet-textures";
import { navigate } from "astro:transitions/client";

const BASE = import.meta.env.BASE_URL;
const TAU = Math.PI * 2;

// ---------- 工具 ----------
function go(path: string) {
  if (/^https?:\/\//.test(path)) { window.open(path, "_blank", "noopener"); return; }
  try {
    navigate(path);
  } catch {
    window.location.href = path;
  }
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,236,180,0.95)");
  g.addColorStop(0.25, "rgba(255,180,80,0.55)");
  g.addColorStop(0.6, "rgba(255,120,40,0.16)");
  g.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function orbitLineGeometry(radius: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * TAU;
    pts.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

// ---------- 太阳 ----------
const sunVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const sunFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    float n = fbm(vUv * 6.0 + vec2(uTime * 0.03, uTime * 0.015));
    float gran = noise(vUv * 34.0 + uTime * 0.05);
    vec3 deep = vec3(1.0, 0.42, 0.05);
    vec3 mid = vec3(1.0, 0.72, 0.25);
    vec3 bright = vec3(1.0, 0.93, 0.62);
    vec3 col = mix(deep, mid, smoothstep(0.25, 0.65, n));
    col = mix(col, bright, smoothstep(0.6, 0.9, n) * 0.7 + gran * 0.12);
    float pulse = 0.96 + 0.04 * sin(uTime * 0.8);
    float limb = 0.82 + 0.18 * abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
    gl_FragColor = vec4(col * pulse * limb, 1.0);
  }
`;

function Sun({ def, labelsVisible, labelDistanceFactor, compactLabels, isFocused, planetPositions, onSelect }: {
  def: PlanetDef;
  labelsVisible: boolean;
  labelDistanceFactor: number;
  compactLabels: boolean;
  isFocused: boolean;
  planetPositions: RefObject<Map<string, THREE.Vector3>>;
  onSelect: (id: PlanetId) => void;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const glow = useMemo(glowTexture, []);
  // 太阳固定在原点；把位置写入共享表，供相机聚焦读取。
  useEffect(() => {
    planetPositions.current.set("sun", new THREE.Vector3(0, 0, 0));
  }, [planetPositions]);
  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta;
  });
  return (
    <group>
      {/* 太阳光：场景唯一主光源，行星昼夜由此产生。强度 3.4：让地球
          白昼面的海洋呈现真实的蓝色（2.4 时叠加 ACES 色调映射会偏黑）。 */}
      <pointLight position={[0, 0, 0]} intensity={3.4} distance={0} decay={0} color="#fff2d8" />
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect("sun"); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        <sphereGeometry args={[def.radius, 48, 48]} />
        <shaderMaterial ref={matRef} vertexShader={sunVertex} fragmentShader={sunFragment} uniforms={{ uTime: { value: 0 } }} toneMapped={false} />
      </mesh>
      <sprite scale={[def.radius * 5.2, def.radius * 5.2, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      {/* 聚焦时隐藏标签：相机离得近，distanceFactor 会把 10px 的标签
          放大数倍，变成横贯全屏的横幅；左下角信息面板已显示该行星信息。 */}
      {labelsVisible && !isFocused && (
        <Html center distanceFactor={labelDistanceFactor} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="planet-label"><span className="planet-label-icon">{def.icon}</span>{compactLabels ? def.name : `${def.name} · ${def.func}`}</div>
        </Html>
      )}
    </group>
  );
}

// ---------- 地球（最高精度模型；从 SpaceCore 迁移至此，成为太阳系的一员） ----------
// 白天纹理：earth_atmos_2048.jpg 的海洋实测只有 RGB(24,35,60)（近乎黑色），
// 即使提亮光照也发黑。这里用提亮版（gamma 0.55 + 饱和度 1.25，海洋约
// RGB(67,85,122)），与原图同 UV，可与 normal/specular/clouds/lights 对齐。
const EARTH_DAY = "textures/earth/earth_day_bright_2048.jpg";
const EARTH_NORMAL = "textures/earth/earth_normal_2048.jpg";
const EARTH_SPEC = "textures/earth/earth_specular_2048.jpg";
const EARTH_CLOUDS = "textures/earth/earth_clouds_1024.png";
const EARTH_LIGHTS = "textures/earth/earth_lights_2048.png";

const lightsVertex = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const lightsFragment = /* glsl */ `
  uniform sampler2D uLights;
  uniform vec3 uSunDir;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    float ndl = dot(normalize(vWorldNormal), normalize(uSunDir));
    float night = smoothstep(0.08, -0.12, ndl);
    vec3 lights = texture2D(uLights, vUv).rgb;
    gl_FragColor = vec4(lights * night * 1.6, 1.0);
  }
`;
const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
    gl_FragColor = vec4(0.35, 0.75, 1.0, 1.0) * intensity;
  }
`;

function EarthModel({ radius, spinSpeed, motionPaused, earthSpinOn, low, earthPosRef }: {
  radius: number;
  spinSpeed: number;
  motionPaused: boolean;
  earthSpinOn: boolean;
  low: boolean;
  earthPosRef: RefObject<THREE.Vector3>;
}) {
  const [day, normal, specular, cloudsTex, lightsTex] = useTexture([
    `${BASE}${EARTH_DAY}`, `${BASE}${EARTH_NORMAL}`, `${BASE}${EARTH_SPEC}`,
    `${BASE}${EARTH_CLOUDS}`, `${BASE}${EARTH_LIGHTS}`,
  ]);
  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    cloudsTex.colorSpace = THREE.SRGBColorSpace;
    lightsTex.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = 4;
  }, [day, cloudsTex, lightsTex]);
  const groupRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const lightsMatRef = useRef<THREE.ShaderMaterial>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    if (!motionPaused && earthSpinOn) g.rotation.y += spinSpeed * delta;
    if (!motionPaused && cloudsRef.current) cloudsRef.current.rotation.y += 0.008 * delta;
    // 夜灯光的太阳方向 = 从地球指向太阳（世界坐标，太阳在原点）
    g.getWorldPosition(tmp);
    earthPosRef.current.copy(tmp);
    if (lightsMatRef.current) {
      const sd = tmp.clone().multiplyScalar(-1).normalize();
      lightsMatRef.current.uniforms.uSunDir.value.copy(sd);
    }
  });
  const seg = low ? 48 : 64;
  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[radius, seg, seg]} />
        <meshPhongMaterial map={day} normalMap={normal} specularMap={specular} specular={new THREE.Color("#4a4a4a")} shininess={18} toneMapped={false} />
      </mesh>
      {/* 地球是主视觉：toneMapped={false} 让 NASA 白天纹理的蓝色直接呈现，不被 ACES 压暗 */}
      <mesh scale={1.004} renderOrder={1}>
        <sphereGeometry args={[radius, seg, seg]} />
        <shaderMaterial
          ref={lightsMatRef}
          vertexShader={lightsVertex}
          fragmentShader={lightsFragment}
          uniforms={{ uLights: { value: lightsTex }, uSunDir: { value: new THREE.Vector3(-0.5, 0.3, 0.8) } }}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={cloudsRef} scale={1.02} renderOrder={2}>
        <sphereGeometry args={[radius, seg, seg]} />
        <meshLambertMaterial map={cloudsTex} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh scale={1.18} renderOrder={3}>
        <sphereGeometry args={[radius, seg, seg]} />
        <shaderMaterial vertexShader={atmosphereVertex} fragmentShader={atmosphereFragment} side={THREE.BackSide} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------- 卫星 ----------
// 聚焦所属行星时卫星停住（否则绕行太快点不中）；平时随行星公转、绕行星运行。
function SatelliteMesh({ sat, orbitRadius, speed, color, motionPaused, paused, onHover, onClick }: {
  sat: Satellite;
  orbitRadius: number;
  speed: number;
  color: string;
  motionPaused: boolean;
  paused: boolean;
  onHover: (sat: Satellite | null) => void;
  onClick: (sat: Satellite) => void;
}) {
  const angle = useRef(Math.random() * TAU);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useFrame((_, delta) => {
    if (!motionPaused && !paused) angle.current += speed * delta;
    const a = angle.current;
    groupRef.current?.position.set(Math.cos(a) * orbitRadius, Math.sin(a) * orbitRadius * 0.3, Math.sin(a) * orbitRadius);
  });
  return (
    <group ref={groupRef}>
      <mesh
        scale={hovered ? 1.7 : 1}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(sat); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); onHover(null); document.body.style.cursor = ""; }}
        onClick={(e) => { e.stopPropagation(); onClick(sat); }}
      >
        <octahedronGeometry args={[0.09]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.9 : 0.35} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.13, 0.008, 8, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* 放大的透明命中球：卫星本体太小，直接点很难命中。
          半径 0.32：配合卫星轨道间距 0.75，相邻命中球不再重叠。 */}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(sat); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); onHover(null); document.body.style.cursor = ""; }}
        onClick={(e) => { e.stopPropagation(); onClick(sat); }}
      >
        <sphereGeometry args={[0.32, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------- 行星球体（按纹理来源分流，避免无用加载） ----------
function UrlPlanetMesh({ def, seg }: { def: PlanetDef; seg: number }) {
  const tex = useTexture(`${BASE}${def.texture.slice(4)}`) as THREE.Texture;
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }, [tex]);
  return (
    <mesh>
      <sphereGeometry args={[def.radius, seg, seg]} />
      <meshStandardMaterial map={tex} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

function ProceduralPlanetMesh({ def, seg }: { def: PlanetDef; seg: number }) {
  const tex = useMemo(
    () => getProceduralTexture(def.texture.slice("procedural:".length)),
    [def.texture],
  );
  return (
    <mesh>
      <sphereGeometry args={[def.radius, seg, seg]} />
      <meshStandardMaterial map={tex} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}
function Planet({ def, satellites, motionPaused, earthSpinOn, labelsVisible, orbitsVisible, labelDistanceFactor, compactLabels, isFocused, low, earthPosRef, planetPositions, onSelect, onSatelliteHover, onSatelliteClick }: {
  def: PlanetDef;
  satellites: Satellite[];
  motionPaused: boolean;
  earthSpinOn: boolean;
  labelsVisible: boolean;
  orbitsVisible: boolean;
  labelDistanceFactor: number;
  compactLabels: boolean;
  isFocused: boolean;
  low: boolean;
  earthPosRef: RefObject<THREE.Vector3>;
  planetPositions: RefObject<Map<string, THREE.Vector3>>;
  onSelect: (id: PlanetId) => void;
  onSatelliteHover: (sat: Satellite | null) => void;
  onSatelliteClick: (sat: Satellite) => void;
}) {
  const angle = useRef(def.initialAngle);
  const carrierRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  // 悬停时行星停住公转（目标不再移动，点得中）；离开后继续。
  const [hovered, setHovered] = useState(false);
  const orbitGeo = useMemo(() => orbitLineGeometry(def.orbitRadius), [def.orbitRadius]);
  const isEarth = def.id === "earth";
  const isSun = def.id === "sun";

  const ringTex = useMemo(() => (def.ring ? getSaturnRingTexture() : null), [def.ring]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (!isSun && !motionPaused && !hovered) angle.current += def.orbitSpeed * delta;
    const a = angle.current;
    carrierRef.current?.position.set(Math.cos(a) * def.orbitRadius, 0, Math.sin(a) * def.orbitRadius);
    if (spinRef.current && !isEarth && !motionPaused) spinRef.current.rotation.y += def.spinSpeed * delta;
    if (carrierRef.current) {
      carrierRef.current.getWorldPosition(tmp);
      let entry = planetPositions.current.get(def.id);
      if (!entry) { entry = new THREE.Vector3(); planetPositions.current.set(def.id, entry); }
      entry.copy(tmp);
    }
  });

  if (isSun) return <Sun def={def} labelsVisible={labelsVisible} labelDistanceFactor={labelDistanceFactor} compactLabels={compactLabels} isFocused={isFocused} planetPositions={planetPositions} onSelect={onSelect} />;

  const seg = low ? 28 : 48;
  // 透明命中球：小行星（水星 r=0.45）在默认视角只有约 8px，靠它才点得中。
  const hitRadius = Math.max(def.radius * 1.6, 0.8);
  return (
    <group rotation={[def.orbitInclination, 0, 0]}>
      {orbitsVisible && (
        <lineLoop geometry={orbitGeo} raycast={() => null}>
          <lineBasicMaterial color="#61edff" transparent opacity={0.16} />
        </lineLoop>
      )}
      <group ref={carrierRef}>
        <group
          ref={spinRef}
          rotation={[0, 0, def.axialTilt]}
          onClick={(e) => { e.stopPropagation(); onSelect(def.id); }}
          onPointerOver={() => { setHovered(true); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { setHovered(false); document.body.style.cursor = ""; }}
        >
          {isEarth ? (
            <EarthModel radius={def.radius} spinSpeed={def.spinSpeed} motionPaused={motionPaused} earthSpinOn={earthSpinOn} low={low} earthPosRef={earthPosRef} />
          ) : def.texture.startsWith("url:") ? (
            <UrlPlanetMesh def={def} seg={seg} />
          ) : (
            <ProceduralPlanetMesh def={def} seg={seg} />
          )}
          {def.ring && ringTex && (
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[def.ring.inner, def.ring.outer, 64]} />
              <meshBasicMaterial map={ringTex} transparent side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          )}
          {/* 透明命中球：扩大可点区域（点击事件冒泡到本组） */}
          <mesh>
            <sphereGeometry args={[hitRadius, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        {/* 卫星：行星组的子对象，随行星公转、绕行星运行 */}
        {satellites.map((sat, i) => (
          <SatelliteMesh
            key={sat.id}
            sat={sat}
            orbitRadius={satelliteOrbitRadius(def.radius, i)}
            speed={0.35 + i * 0.18}
            color={def.color}
            motionPaused={motionPaused}
            paused={isFocused}
            onHover={onSatelliteHover}
            onClick={onSatelliteClick}
          />
        ))}
        {/* 聚焦时隐藏标签：相机离得近，distanceFactor 会把 10px 的标签
            放大数倍，变成横贯全屏的横幅；左下角信息面板已显示该行星信息。 */}
        {labelsVisible && !isFocused && (
          <Html center distanceFactor={labelDistanceFactor} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div className="planet-label"><span className="planet-label-icon">{def.icon}</span>{compactLabels ? def.name : `${def.name} · ${def.func}`}</div>
          </Html>
        )}
      </group>
    </group>
  );
}

// ---------- 太阳系 ----------
export function SolarSystem({ planetSatellites, motionPaused, earthSpinOn, labelsVisible, orbitsVisible, labelDistanceFactor, compactLabels, focusedId, low, earthPosRef, planetPositions, onSelect, onSatelliteHover, onSatelliteClick }: {
  planetSatellites: Record<string, Satellite[]>;
  motionPaused: boolean;
  earthSpinOn: boolean;
  labelsVisible: boolean;
  orbitsVisible: boolean;
  labelDistanceFactor: number;
  compactLabels: boolean;
  focusedId: PlanetId | null;
  low: boolean;
  earthPosRef: RefObject<THREE.Vector3>;
  planetPositions: RefObject<Map<string, THREE.Vector3>>;
  onSelect: (id: PlanetId) => void;
  onSatelliteHover: (sat: Satellite | null) => void;
  onSatelliteClick: (sat: Satellite) => void;
}) {
  return (
    <group>
      {PLANETS.map((def) => (
        <Planet
          key={def.id}
          def={def}
          satellites={planetSatellites[def.id] ?? []}
          motionPaused={motionPaused}
          earthSpinOn={earthSpinOn}
          labelsVisible={labelsVisible}
          orbitsVisible={orbitsVisible}
          labelDistanceFactor={labelDistanceFactor}
          compactLabels={compactLabels}
          isFocused={focusedId === def.id}
          low={low}
          earthPosRef={earthPosRef}
          planetPositions={planetPositions}
          onSelect={onSelect}
          onSatelliteHover={onSatelliteHover}
          onSatelliteClick={onSatelliteClick}
        />
      ))}
    </group>
  );
}

export { PLANET_MAP, go };
