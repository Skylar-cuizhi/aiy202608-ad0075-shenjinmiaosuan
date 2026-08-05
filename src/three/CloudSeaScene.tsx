import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Instance, Instances, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { cloudPuffTexture, glowDotTexture, plaqueTexture, ridgeTexture } from './textures';

/**
 * 见微 · 云海天门：全程序化生成的中式 3D 场景。
 * 云海 = FBM 噪声着色器；云层 = 实例化蓬松云团；天门 = 石柱 + 光门；
 * 镜头由 GSAP 驱动的 rig（scroll 推进 + fly 穿门）在 useFrame 中解算。
 */

export interface SceneRig {
  /** 0..1，滚动推进（沿云路向天门） */
  scroll: number;
  /** 0..1，穿门飞行（启卷离场） */
  fly: number;
}

const GATE_Z = -96;

// ================= 云海（着色器） =================

const SEA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SEA_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.04 + vec2(17.3, 9.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float far = vUv.y; // v=1 为远端（rotateX(-90°) 后 +v 指向 -z）
    vec2 p = vec2(vUv.x * 90.0, vUv.y * 40.0);
    float t = uTime * 0.03;
    float h = fbm(p + vec2(t * 2.0, t * 0.4));
    h = h * 0.8 + 0.2 * fbm(p * 2.6 - vec2(t * 3.0, 0.0));

    vec3 lit = vec3(0.995, 0.965, 0.90);
    vec3 mid = vec3(0.905, 0.835, 0.70);
    vec3 shade = vec3(0.74, 0.655, 0.53);
    vec3 col = mix(shade, mix(mid, lit, smoothstep(0.42, 0.72, h)), smoothstep(0.24, 0.5, h));

    // 云路：中央浅色石径，远处收窄（世界宽度 ~14 → ~6，似直路延伸向天门）
    float w = mix(0.028, 0.010, pow(far, 1.15));
    float d = abs(vUv.x - 0.5);
    float path = 1.0 - smoothstep(w * 0.4, w, d);
    vec3 pathCol = vec3(1.0, 0.97, 0.88);
    col = mix(col, pathCol, path * (0.92 - h * 0.3));
    // 路沿淡淡阴影勾边
    float edge = smoothstep(w, w * 1.35, d) * (1.0 - smoothstep(w * 1.35, w * 2.1, d));
    col = mix(col, shade * 0.94, edge * 0.35);

    // 天门光晕洒落云路尽头（天门位于 v≈0.467 处）
    float gateGlow = exp(-pow((far - 0.467) * 7.0, 2.0)) * (1.0 - smoothstep(0.0, 0.05, d));
    col += vec3(1.0, 0.94, 0.78) * gateGlow * 0.65;

    // 远处没入雾色
    vec3 fogCol = vec3(0.949, 0.906, 0.812);
    col = mix(col, fogCol, smoothstep(0.55, 0.985, far));

    gl_FragColor = vec4(col, 1.0);
  }
`;

function CloudSea() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -110]}>
      <planeGeometry args={[560, 420]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={SEA_VERT}
        fragmentShader={SEA_FRAG}
        uniforms={uniforms}
      />
    </mesh>
  );
}

// ================= 实例化云团 =================

function CloudPuffs({ count, seed, yBase, driftSpeed, opacity }: {
  count: number; seed: number; yBase: [number, number]; driftSpeed: number; opacity: number;
}) {
  const group = useRef<THREE.Group>(null);
  const tex = useMemo(() => cloudPuffTexture(), []);
  const items = useMemo(() => {
    let s = seed;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    return Array.from({ length: count }, () => ({
      position: [
        (rand() - 0.5) * 190,
        yBase[0] + rand() * (yBase[1] - yBase[0]),
        30 - rand() * 210,
      ] as [number, number, number],
      scale: 7 + rand() * 16,
    }));
  }, [count, seed, yBase]);

  useFrame((state) => {
    if (group.current) {
      const t = state.clock.elapsedTime;
      group.current.position.x = Math.sin(t * driftSpeed) * 9;
      group.current.position.z = Math.cos(t * driftSpeed * 0.6) * 4;
    }
  });

  return (
    <Billboard ref={group}>
      <Instances limit={count} frustumCulled={false}>
        <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} fog />
        <planeGeometry args={[1, 1]} />
        {items.map((it, i) => (
          <Instance key={i} position={it.position} scale={[it.scale * 1.9, it.scale, 1]} />
        ))}
      </Instances>
    </Billboard>
  );
}

// ================= 灵气粒子 =================

function Motes({ count = 240 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const tex = useMemo(() => glowDotTexture(), []);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 120;
      arr[i * 3 + 1] = Math.random() * 26;
      arr[i * 3 + 2] = 20 - Math.random() * 160;
    }
    return arr;
  }, [count]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) + dt * 0.55;
      if (y > 28) y = 0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        color="#c9a24d"
        size={0.55}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ================= 远山 =================

function Ridges() {
  const ridges = useMemo(
    () => [
      { tex: ridgeTexture(7, 0.34), position: [0, 15, -185] as const, scale: [420, 60, 1] as const },
      { tex: ridgeTexture(23, 0.42), position: [-30, 11, -150] as const, scale: [380, 48, 1] as const },
      { tex: ridgeTexture(51, 0.5), position: [25, 8, -122] as const, scale: [340, 38, 1] as const },
    ],
    [],
  );
  return (
    <>
      {ridges.map((r, i) => (
        <mesh key={i} position={[r.position[0], r.position[1], r.position[2]]}>
          <planeGeometry args={[r.scale[0], r.scale[1]]} />
          <meshBasicMaterial map={r.tex} transparent depthWrite={false} fog={false} />
        </mesh>
      ))}
    </>
  );
}

// ================= 天门 =================

const GLOW_FRAG = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p * vec2(1.0, 0.62));
    float a = smoothstep(0.52, 0.04, d);
    vec3 col = vec3(1.0, 0.94, 0.78);
    gl_FragColor = vec4(col * a, a);
  }
`;

function Gate() {
  const plaque = useMemo(() => plaqueTexture(), []);
  // 墨石剪影：深色门框衬于光门之前，取「墨分五色」之意
  const stone = '#574a36';
  const stoneDark = '#3f3527';
  return (
    <group position={[0, 0, GATE_Z]} scale={[1.28, 1.28, 1.28]}>
      {/* 双柱 */}
      <mesh position={[-3.6, 6, 0]}>
        <boxGeometry args={[1.1, 12, 1.1]} />
        <meshBasicMaterial color={stone} />
      </mesh>
      <mesh position={[3.6, 6, 0]}>
        <boxGeometry args={[1.1, 12, 1.1]} />
        <meshBasicMaterial color={stone} />
      </mesh>
      {/* 门楣 */}
      <mesh position={[0, 12.4, 0]}>
        <boxGeometry args={[9.6, 1, 1.4]} />
        <meshBasicMaterial color={stoneDark} />
      </mesh>
      {/* 飞檐（双层微翘） */}
      <mesh position={[0, 13.3, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[11.4, 0.45, 2]} />
        <meshBasicMaterial color={stone} />
      </mesh>
      <mesh position={[-5.9, 13.75, 0]} rotation={[0, 0, 0.22]}>
        <boxGeometry args={[1.6, 0.4, 2]} />
        <meshBasicMaterial color={stone} />
      </mesh>
      <mesh position={[5.9, 13.75, 0]} rotation={[0, 0, -0.22]}>
        <boxGeometry args={[1.6, 0.4, 2]} />
        <meshBasicMaterial color={stone} />
      </mesh>
      <mesh position={[0, 14.4, 0]}>
        <boxGeometry args={[7, 1.6, 1.2]} />
        <meshBasicMaterial color={stoneDark} />
      </mesh>
      {/* 光门 */}
      <mesh position={[0, 6, 0.2]}>
        <planeGeometry args={[6.2, 12]} />
        <shaderMaterial
          vertexShader={SEA_VERT}
          fragmentShader={GLOW_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 门后光柱冲天 */}
      <mesh position={[0, 16, -1.5]}>
        <planeGeometry args={[9, 34]} />
        <shaderMaterial
          vertexShader={SEA_VERT}
          fragmentShader={GLOW_FRAG}
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 门匾「见微」 */}
      <mesh position={[0, 11.4, 0.85]}>
        <planeGeometry args={[1.15, 2.3]} />
        <meshBasicMaterial map={plaque} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ================= 朱日 =================

function CinnabarSun() {
  const tex = useMemo(() => glowDotTexture(128), []);
  return (
    <sprite position={[38, 34, -175]} scale={[30, 30, 1]}>
      <spriteMaterial map={tex} color="#cf6646" transparent opacity={0.9} depthWrite={false} fog={false} />
    </sprite>
  );
}

// ================= 镜头装置 =================

function CameraRig({ rig }: { rig: { current: SceneRig } }) {
  const smooth = useRef({ x: 0, y: 0 });
  useFrame((state) => {
    const { scroll, fly } = rig.current;
    const sf = fly * fly * (3 - 2 * fly); // smoothstep 穿门
    const cam = state.camera as THREE.PerspectiveCamera;

    // 指针视差（缓动跟随）
    smooth.current.x += (state.pointer.x * 2.1 - smooth.current.x) * 0.04;
    smooth.current.y += (state.pointer.y * 1.1 - smooth.current.y) * 0.04;

    cam.position.set(
      smooth.current.x * (1 - sf),
      7 - scroll * 2.2 + smooth.current.y + sf * 1.6,
      26 - scroll * 47 - sf * 118,
    );
    cam.lookAt(0, 4.8 - scroll * 1.2 + sf * 1.2, GATE_Z);
    const fov = 52 + sf * 18;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

// ================= 场景入口 =================

export default function CloudSeaScene({ rig }: { rig: { current: SceneRig } }) {
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <PerspectiveCamera makeDefault position={[0, 7, 26]} fov={52} near={0.1} far={600} />
      <color attach="background" args={['#f2e7cf']} />
      <fog attach="fog" args={['#f2e7cf', 60, 320]} />
      <CameraRig rig={rig} />
      <CloudSea />
      <Ridges />
      <CinnabarSun />
      <CloudPuffs count={90} seed={11} yBase={[1.4, 5.5]} driftSpeed={0.016} opacity={0.62} />
      <CloudPuffs count={60} seed={37} yBase={[5.5, 11]} driftSpeed={0.011} opacity={0.46} />
      <Motes />
      <Gate />
    </Canvas>
  );
}
