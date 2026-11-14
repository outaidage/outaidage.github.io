// SpaceCore.tsx — the DIGITAL UNIVERSE 2.0 home-page 3D energy core.
// Real WebGL scene (three + React Three Fiber): a breathing emissive core,
// an energy-cage wireframe, two tilted orbit rings with satellites, a mixed
// cyan/white/purple starfield, and a camera rig that follows the pointer.
// Loaded with `client:visible` on the home page only, so it is code-split
// and never blocks first paint. The canvas is transparent — the page's own
// 2D universe background shows through behind it.
// Performance: DPR capped at 1.5, ~600 starfield points, rendering pauses
// when the tab is hidden, and the whole scene returns null on mobile
// (<760px), reduced-motion, or when the site motion toggle is off (the
// lightweight 2D canvas fallback covers those cases instead).
// Palette: #03040B / #10102B / #61EDFF / #A68AFF / #7DFFCE.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const CYAN = "#61EDFF";
const PURPLE = "#A68AFF";
const GREEN = "#7DFFCE";
const CORE_BASE = "#0a1628";

/** Camera rig: lerps the camera toward the pointer and always looks at the core. */
function CameraRig() {
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    target.set(state.pointer.x * 0.9, state.pointer.y * 0.55, 8);
    state.camera.position.lerp(target, 0.04);
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

/** The energy core: emissive icosphere + counter-rotating wireframe cage. */
function EnergyCore() {
  const groupRef = useRef<THREE.Group>(null);
  const cageRef = useRef<THREE.Mesh>(null);
  const coreMatRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // One shared sine (~2.5s period) drives both the scale pulse and the
    // emissive pulse so they breathe in sync.
    const pulse = Math.sin((t / 2.5) * Math.PI * 2); // -1 .. 1
    const group = groupRef.current;
    if (group) {
      group.scale.setScalar(1 + 0.025 * (1 + pulse)); // 1.0 .. 1.05
      group.rotation.y += delta * 0.15;
    }
    if (coreMatRef.current) {
      coreMatRef.current.emissiveIntensity = 0.9 + 0.3 * pulse; // 0.6 .. 1.2
    }
    if (cageRef.current) {
      cageRef.current.rotation.y -= delta * 0.1;
      cageRef.current.rotation.x += delta * 0.03;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.35, 0, 0]}>
      <mesh>
        <icosahedronGeometry args={[1.6, 32]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color={CORE_BASE}
          emissive={CYAN}
          emissiveIntensity={0.9}
          roughness={0.35}
          metalness={0.6}
          flatShading
        />
      </mesh>
      {/* Energy cage: wireframe shell rotating the opposite way. */}
      <mesh ref={cageRef}>
        <icosahedronGeometry args={[1.75, 1]} />
        <meshBasicMaterial color={CYAN} wireframe transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

/** Two tilted orbit rings rotating in opposite directions, with satellites. */
function OrbitRings() {
  const ring1Ref = useRef<THREE.Group>(null);
  const ring2Ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (ring1Ref.current) ring1Ref.current.rotation.y += delta * 0.12;
    if (ring2Ref.current) ring2Ref.current.rotation.y -= delta * 0.09;
  });

  return (
    <>
      <group ref={ring1Ref} rotation={[Math.PI / 2.6, 0, 0.3]}>
        <mesh>
          <torusGeometry args={[2.7, 0.015, 12, 128]} />
          <meshBasicMaterial color={CYAN} transparent opacity={0.8} />
        </mesh>
        <mesh position={[2.7, 0, 0]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial color={GREEN} />
        </mesh>
        <mesh position={[-2.7, 0, 0]}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshBasicMaterial color={CYAN} />
        </mesh>
      </group>
      <group ref={ring2Ref} rotation={[Math.PI / 1.8, 0.5, 0]}>
        <mesh>
          <torusGeometry args={[3.5, 0.012, 12, 128]} />
          <meshBasicMaterial color={PURPLE} transparent opacity={0.7} />
        </mesh>
        <mesh position={[3.5, 0, 0]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshBasicMaterial color={PURPLE} />
        </mesh>
      </group>
    </>
  );
}

/** Procedural starfield: points in a 6–14 radius shell, mixed palette. */
function Starfield({ count = 600 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [CYAN, "#ffffff", PURPLE, GREEN].map(
      (c) => new THREE.Color(c),
    );
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, [count]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.01;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}

export default function SpaceCore() {
  // Start disabled so the server render and the first client render agree
  // (null); the real check runs once after mount, client-side only.
  const [enabled, setEnabled] = useState(false);
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  useEffect(() => {
    const reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "reduced";
    const isMobile = window.innerWidth < 760;
    setEnabled(!reducedMotion && !isMobile);
  }, []);

  // Pause all rendering while the tab is in the background.
  useEffect(() => {
    const onVisibility = () =>
      setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (!enabled) return null;

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 8], fov: 45 }}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      frameloop={frameloop}
      style={{ background: "transparent", width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 5, 5]} intensity={0.4} color={PURPLE} />
      <pointLight
        position={[0, 0, 0]}
        intensity={30}
        distance={12}
        decay={2}
        color={CYAN}
      />
      <EnergyCore />
      <OrbitRings />
      <Starfield count={600} />
      <CameraRig />
    </Canvas>
  );
}
