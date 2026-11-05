import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { InstancedPart } from './scene/instancing';
import { InstanceSet } from './scene/instanceSet';
import { createMotionMaterial, useSceneClock } from './scene/sceneMaterials';

type RenderQuality = 'high' | 'balanced' | 'lite';

interface SceneAmbienceProps {
  length: number;
  width: number;
  height: number;
  quality: RenderQuality;
  /** The landscape's grass colours, and how thick the grass is (1 = a meadow, 0.2 = desert). */
  grassColors: string[];
  grassDensity: number;
  /** Height of the ground at a point, so tufts sit on rolling ground. */
  groundAt: (x: number, z: number) => number;
  /** From the sky: cloud colour, opacity and how many (1 = a fair-weather sky). */
  clouds: { color: string; opacity: number; count: number };
  /** Pollen by day, fireflies by night. */
  moteColor: string;
  /** Darkens the grass under a night or monsoon sky. */
  shade: number;
}

/** Small seeded PRNG so the landscape is identical between renders. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * One grass tuft: a few thin, tapering blades fanning out from a small clump, darker at the base than
 * at the tip (vertex colours). Unit height; the instance scales it to the tuft's height.
 */
function tuftGeometry(): THREE.BufferGeometry {
  const rand = rng(3);
  const positions: number[] = [];
  const colors: number[] = [];
  const blades = 6;
  for (let i = 0; i < blades; i += 1) {
    const yaw = (i / blades) * Math.PI * 2 + rand() * 0.8;
    const out = 0.01 + rand() * 0.02;
    const lean = 0.05 + rand() * 0.09;
    const half = 0.004 + rand() * 0.003;
    const top = 0.65 + rand() * 0.35;
    const [dx, dz] = [Math.sin(yaw), Math.cos(yaw)];
    // Blade base across the radial direction, tip leaning outward.
    const bx = dx * out;
    const bz = dz * out;
    const tx = dx * (out + lean);
    const tz = dz * (out + lean);
    positions.push(bx - dz * half, 0, bz + dx * half, bx + dz * half, 0, bz - dx * half, tx, top, tz);
    colors.push(0.55, 0.6, 0.5, 0.55, 0.6, 0.5, 1.05, 1.05, 0.95);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Low grass tufts scattered around (never inside) the structure footprint, thicker near the house.
 * They are 8 to 25 cm tall in a few greens and straws, and sway in the vertex shader, so there is no
 * per-frame work on the CPU.
 */
function Grass({ length, width, count, colors, groundAt, shade }: { length: number; width: number; count: number; colors: string[]; groundAt: (x: number, z: number) => number; shade: number }) {
  useSceneClock();
  const set = useMemo(() => {
    const rand = rng(7);
    const halfW = width / 2 + 2.5;
    const halfL = length / 2 + 2.5;
    const tufts = new InstanceSet();
    let guard = 0;
    while (tufts.count < count && guard < count * 20) {
      guard += 1;
      // Denser near the house, thinning out towards the edge of the ground.
      const radius = Math.max(halfW, halfL) * 0.6 + Math.pow(rand(), 1.6) * 45;
      const angle = rand() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.abs(x) < halfW && Math.abs(z) < halfL) continue;
      const height = 0.08 + Math.pow(rand(), 2) * 0.17;
      const spread = 0.8 + rand() * 0.8;
      tufts.add([x, Math.max(-0.03, groundAt(x, z) + 0.01), z], [spread, height, spread], colors[Math.floor(rand() * colors.length)], rand() * Math.PI * 2);
    }
    return tufts;
  }, [length, width, count, colors, groundAt]);
  const geometry = useMemo(() => tuftGeometry(), []);
  const material = useMemo(
    () => createMotionMaterial('sway', { color: '#ffffff', vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }, { amp: 0.25, base: 0 }),
    []
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.color.setScalar(shade);
  }, [material, shade]);

  return <InstancedPart name="ground-grass" set={set} geometry={geometry} material={material} />;
}

/** Below this height the clouds are fully drawn; they fade out as the camera climbs towards them. */
const CLOUD_BASE = 70;

/**
 * Soft puffy clouds drifting high across the sky and wrapping around. A camera can orbit up to a
 * couple of hundred metres away, so from above a cloud would show as a pale dome over the house:
 * the clouds fade out as the camera rises towards them.
 */
function Clouds({ count, color, opacity }: { count: number; color: string; opacity: number }) {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const rand = rng(21);
    // On a wide ring round the site (beyond the ground disc), so they sit low over the horizon.
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2 + rand() * 0.6,
      ring: 150 + rand() * 80,
      y: CLOUD_BASE + 5 + rand() * 25,
      speed: 0.8 + rand() * 1.4,
      puffs: Array.from({ length: 5 }, (_, i) => ({
        dx: (i - 2) * (4 + rand() * 2),
        dy: rand() * 2,
        dz: (rand() - 0.5) * 4,
        r: 4 + rand() * 3.5,
      })),
    }));
  }, [count]);
  const peak = opacity;
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: peak, depthWrite: false, fog: false }), [color, peak]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera }, delta) => {
    group.current?.children.forEach((child, i) => {
      const cloud = clouds[i];
      cloud.angle += (cloud.speed / cloud.ring) * delta;
      child.position.set(Math.cos(cloud.angle) * cloud.ring, cloud.y, Math.sin(cloud.angle) * cloud.ring);
    });
    const fade = THREE.MathUtils.clamp((CLOUD_BASE - camera.position.y) / 25, 0, 1);
    material.opacity = peak * fade;
    if (group.current) group.current.visible = fade > 0.01;
  });

  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[Math.cos(c.angle) * c.ring, c.y, Math.sin(c.angle) * c.ring]}>
          {c.puffs.map((p, j) => (
            <mesh key={j} position={[p.dx, p.dy, p.dz]} scale={[1.4, 0.7, 1]} material={material}>
              <sphereGeometry args={[p.r, 12, 10]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Pollen / dust motes rising in the sunlight around and above the structure. */
function Motes({ length, width, height, count, color }: { length: number; width: number; height: number; count: number; color: string }) {
  const ref = useRef<THREE.Points>(null);
  const seeds = useMemo(() => {
    const rand = rng(99);
    return Array.from({ length: count }, () => ({
      x: (rand() - 0.5) * (width + 14),
      z: (rand() - 0.5) * (length + 14),
      y: rand() * (height + 4),
      v: 0.15 + rand() * 0.35,
      phase: rand() * 6.28,
    }));
  }, [length, width, height, count]);
  const positions = useMemo(() => new Float32Array(count * 3), [count]);

  useFrame(({ clock }, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      s.y += s.v * delta;
      if (s.y > height + 4) s.y = 0.2;
      positions[i * 3] = s.x + Math.sin(t * 0.6 + s.phase) * 0.6;
      positions[i * 3 + 1] = s.y;
      positions[i * 3 + 2] = s.z + Math.cos(t * 0.5 + s.phase) * 0.6;
    });
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    // The count changes with the quality level. WebGL cannot resize an uploaded buffer, so a new
    // count must mean a new <points> object (otherwise every frame throws).
    <points key={count} ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.12} transparent opacity={0.65} depthWrite={false} sizeAttenuation />
    </points>
  );
}

/**
 * Living backdrop for the visualizers: swaying grass round the house, drifting clouds and pollen.
 * The ground itself, trees and hills are EnvironmentBackdrop's.
 */
export function SceneAmbience({ length, width, height, quality, grassColors, grassDensity, groundAt, clouds, moteColor, shade }: SceneAmbienceProps) {
  const grassCount = Math.round((quality === 'high' ? 3200 : quality === 'balanced' ? 1500 : 0) * grassDensity);
  const cloudCount = quality === 'lite' ? 0 : Math.round((quality === 'high' ? 7 : 4) * clouds.count);
  const moteCount = quality === 'high' ? 140 : quality === 'balanced' ? 70 : 0;

  return (
    <group>
      {grassCount > 0 && <Grass length={length} width={width} count={grassCount} colors={grassColors} groundAt={groundAt} shade={shade} />}
      {cloudCount > 0 && <Clouds count={cloudCount} color={clouds.color} opacity={clouds.opacity} />}
      {moteCount > 0 && <Motes length={length} width={width} height={height} count={moteCount} color={moteColor} />}
    </group>
  );
}
