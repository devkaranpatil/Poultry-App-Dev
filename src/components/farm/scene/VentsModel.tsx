import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { SideVentilation } from '@/components/farm/scene/legacyConfig';
import { InstanceSet, InstancedPart, addSegment } from './instancing';
import type { RenderQuality } from './cropLayout';
import { geo } from './sceneGeometry';
import { sweptSheet } from './structureGeometry';
import { sideOpening, type StructureLayout } from './structureLayout';
import { createCurtainMaterial, createInsectNetMaterial } from './structureMaterials';

/**
 * Side ventilation in both long walls, in the band between the kerb apron and the fixed film below the
 * gutter (see sideOpening):
 *  manual-rollup     film curtain rolled up on a shaft, insect net behind, hand-crank gear box at the front end
 *  motorized-rollup  the same curtain driven by a gear motor on a guide rail, with its control box
 *  louver            rows of aluminium louvre blades in panels between the columns
 * Roll-up curtains are tied with anti-billow ropes crossing every bay.
 */

interface VentsModelProps {
  layout: StructureLayout;
  type: Exclude<SideVentilation, 'none'>;
  quality: RenderQuality;
  onSelect?: () => void;
}

/** Height of the curtain shaft: the curtain is rolled up about 60 % of the way. */
export function rollHeight(gutterHeight: number): number {
  const { bottom, top } = sideOpening(gutterHeight);
  return bottom + (top - bottom) * 0.6;
}

const STEEL = '#8c959e';
const ALU = '#d9dfe5';

function RollUp({ layout, motorized, quality }: { layout: StructureLayout; motorized: boolean; quality: RenderQuality }) {
  const built = useMemo(() => {
    const { gutterHeight: G, halfLength, halfWidth, length, frameZ } = layout;
    const { bottom, top } = sideOpening(G);
    const roll = rollHeight(G);
    const curtain = createCurtainMaterial();
    const net = createInsectNetMaterial(quality);
    const metal = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.4 });
    const rope = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
    const nets = sweptSheet([[[0, bottom], [0, top]]], [-halfWidth + 0.02, halfWidth - 0.02], 0, -halfLength, halfLength);
    const film = sweptSheet([[[0, roll], [0, top]]], [-halfWidth - 0.06, halfWidth + 0.06], 0, -halfLength, halfLength);

    const pipes = new InstanceSet();
    const ropes = new InstanceSet();
    for (const side of [-1, 1]) {
      const x = side * (halfWidth + 0.08);
      // The rolled film on its 27 mm shaft, and the curtain runner pipe the curtain hangs from.
      pipes.add([x, roll, 0], [0.055, length + 0.1, 0.055], '#e3efe9', 0, Math.PI / 2);
      pipes.add([side * (halfWidth + 0.04), top + 0.03, 0], [0.021, length, 0.021], STEEL, 0, Math.PI / 2);
      if (quality !== 'lite') {
        const ropeX = side * (halfWidth + 0.15);
        for (let i = 0; i < frameZ.length - 1; i += 1) {
          addSegment(ropes, [ropeX, top, frameZ[i]], [ropeX, bottom, frameZ[i + 1]], 0.006, '#30343a');
          addSegment(ropes, [ropeX, bottom, frameZ[i]], [ropeX, top, frameZ[i + 1]], 0.006, '#30343a');
        }
      }
    }
    return {
      curtain,
      net,
      metal,
      rope,
      nets,
      film,
      pipes,
      ropes,
      roll,
      dispose: () => [curtain, net, metal, rope, nets, film].forEach((item) => item.dispose()),
    };
  }, [layout, quality]);
  useEffect(() => () => built.dispose(), [built]);

  const { halfWidth, halfLength, gutterHeight } = layout;
  const { bottom, top } = sideOpening(gutterHeight);
  const endZ = halfLength - 0.25;

  return (
    <>
      <mesh name="vent-insect-net" geometry={built.nets} material={built.net} renderOrder={1} />
      <mesh name="vent-curtain" geometry={built.film} material={built.curtain} renderOrder={1} />
      <InstancedPart name="vent-pipes" set={built.pipes} geometry={geo.cylinderRound()} material={built.metal} />
      <InstancedPart name="vent-ropes" set={built.ropes} geometry={geo.cylinder()} material={built.rope} />
      {[-1, 1].map((side) => {
        const x = side * (halfWidth + 0.08);
        return motorized ? (
          // Gear motor on the shaft end, riding a vertical guide rail, wired to a control box on the corner post.
          <group key={side} name="vent-drive">
            <mesh position={[x, built.roll, endZ]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.085, 0.085, 0.28, 14]} />
              <meshStandardMaterial color="#1e3a8a" metalness={0.3} roughness={0.4} />
            </mesh>
            <mesh position={[x + side * 0.1, built.roll, endZ + 0.05]}>
              <boxGeometry args={[0.14, 0.2, 0.18]} />
              <meshStandardMaterial color="#334155" metalness={0.3} roughness={0.45} />
            </mesh>
            <mesh position={[x + side * 0.2, (bottom + top) / 2, endZ + 0.05]}>
              <boxGeometry args={[0.05, top - bottom + 0.4, 0.05]} />
              <meshStandardMaterial color={ALU} metalness={0.45} roughness={0.3} />
            </mesh>
            <mesh position={[side * (halfWidth + 0.12), 1.3, halfLength - 0.05]}>
              <boxGeometry args={[0.16, 0.24, 0.12]} />
              <meshStandardMaterial color="#e5e7eb" roughness={0.45} />
            </mesh>
            <mesh position={[side * (halfWidth + 0.21), 1.36, halfLength - 0.05]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.9} />
            </mesh>
          </group>
        ) : (
          // Hand-crank gear box on the shaft end with its telescopic handle hanging to working height.
          <group key={side} name="vent-crank">
            <mesh position={[x + side * 0.06, built.roll, endZ]}>
              <boxGeometry args={[0.12, 0.18, 0.16]} />
              <meshStandardMaterial color="#475569" metalness={0.4} roughness={0.4} />
            </mesh>
            <mesh position={[x + side * 0.1, (built.roll + 0.9) / 2, endZ]}>
              <cylinderGeometry args={[0.014, 0.014, built.roll - 0.9, 8]} />
              <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.35} />
            </mesh>
            <mesh position={[x + side * 0.1, 0.9, endZ]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.1, 0.014, 8, 20]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.35} roughness={0.35} />
            </mesh>
            <mesh position={[x + side * 0.1, 0.8, endZ + 0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 0.14, 8]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Louvres({ layout }: { layout: StructureLayout }) {
  const { gutterHeight, halfWidth, length, frameZ } = layout;
  const { bottom, top } = sideOpening(gutterHeight);
  const pitch = 0.17;
  const rows = Math.max(4, Math.floor((top - bottom) / pitch));
  const built = useMemo(() => {
    const blade = new THREE.BoxGeometry(0.012, 0.16, length - 0.1);
    const material = new THREE.MeshStandardMaterial({ color: '#e5e9ee', metalness: 0.4, roughness: 0.32 });
    const frameMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.35 });
    // Panel frames: a mullion at every column line, rails above and below the blades.
    const frames = new InstanceSet();
    for (const side of [-1, 1]) {
      const x = side * (halfWidth + 0.05);
      for (const z of frameZ) frames.add([x, (bottom + top) / 2, z], [0.03, top - bottom, 0.03], '#9aa4ae');
      for (const y of [bottom, top]) frames.add([x, y, 0], [0.03, length, 0.03], '#9aa4ae', 0, Math.PI / 2);
    }
    return { blade, material, frameMaterial, frames, dispose: () => [blade, material, frameMaterial].forEach((item) => item.dispose()) };
  }, [length, halfWidth, frameZ, bottom, top]);
  useEffect(() => () => built.dispose(), [built]);

  return (
    <>
      {[-1, 1].map((side) =>
        Array.from({ length: rows }, (_, i) => (
          // Blades run along the wall (z) and tilt about their own long axis, like real louvres.
          <mesh
            key={`${side}-${i}`}
            name="louver-slat"
            geometry={built.blade}
            material={built.material}
            position={[side * (halfWidth + 0.06), bottom + pitch * (i + 0.5), 0]}
            rotation={[0, 0, side * 0.55]}
          />
        ))
      )}
      <InstancedPart name="louver-frames" set={built.frames} geometry={geo.square()} material={built.frameMaterial} />
    </>
  );
}

export function VentsModel({ layout, type, quality, onSelect }: VentsModelProps) {
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelect?.();
  };
  return (
    <group name={`vents-${type}`} userData={{ vent: type }} onPointerDown={handlePointerDown}>
      {type === 'louver' ? <Louvres layout={layout} /> : <RollUp layout={layout} motorized={type === 'motorized-rollup'} quality={quality} />}
    </group>
  );
}
