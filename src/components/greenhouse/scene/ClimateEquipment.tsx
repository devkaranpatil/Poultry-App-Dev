import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { InstanceSet, InstancedPart } from './instancing';
import type { RenderQuality } from './cropLayout';
import { geo } from './sceneGeometry';
import { fanRotor, type Rect } from './structureGeometry';
import { fanPositions, spaced, type StructureLayout } from './structureLayout';
import { coolingPadTexture } from './structureMaterials';

/**
 * Fan-and-pad climate control: a wet cellulose pad wall in the back end wall (water pipe over it,
 * collecting gutter under it, a sump pump), exhaust fans in the front end wall either side of the entry,
 * horizontal airflow fans hung under the trusses, a part-drawn shade screen at gutter height, and the
 * controller beside the door. Exhaust fan rotors turn (not on lite).
 */

interface ClimateEquipmentProps {
  layout: StructureLayout;
  padOpening: Rect;
  /** Half width and height of the entry, which the fans keep clear of. */
  entry: { halfWidth: number; height: number };
  quality: RenderQuality;
  onSelect?: () => void;
}

const FAN = 1.25;
const GALV = '#b3bbc3';

/** Where the exhaust fans go: beside the entry if there is room, otherwise smaller fans above it. */
export function exhaustFans(layout: StructureLayout, entry: { halfWidth: number; height: number }): { x: number; y: number; size: number }[] {
  const beside = fanPositions(layout.halfWidth, entry.halfWidth, FAN);
  if (beside.length > 0) return beside.map((x) => ({ x, y: 0.4 + FAN / 2, size: FAN }));
  const size = 0.8;
  const y = entry.height + 0.2 + size / 2;
  if (y + size / 2 > layout.gutterHeight + layout.rise * 0.6) return [];
  const xs = layout.halfWidth > size * 1.6 ? [-size * 0.65, size * 0.65] : [0];
  return xs.map((x) => ({ x, y, size }));
}

export function ClimateEquipment({ layout, padOpening, entry, quality, onSelect }: ClimateEquipmentProps) {
  const rotors = useRef<THREE.Group>(null);
  const led = useRef<THREE.Mesh>(null);
  const { gutterHeight: G, halfLength, halfWidth, length, width, spanCentres } = layout;
  const fans = useMemo(() => exhaustFans(layout, entry), [layout, entry]);

  const built = useMemo(() => {
    const galv = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.5, roughness: 0.35, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: '#2b3036', metalness: 0.4, roughness: 0.5 });
    const texture = coolingPadTexture()?.clone() ?? null;
    const padWidth = padOpening.x1 - padOpening.x0;
    const padHeight = padOpening.y1 - padOpening.y0;
    if (texture) {
      texture.repeat.set(padWidth / 0.5, padHeight / 0.5);
      texture.needsUpdate = true;
    }
    const pad = new THREE.MeshStandardMaterial({ color: texture ? '#ffffff' : '#a8743c', map: texture, roughness: 0.95 });
    const screen = new THREE.MeshStandardMaterial({ color: '#d5d9dd', metalness: 0.35, roughness: 0.5, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const rotorGeometry = fanRotor(quality === 'lite' ? 3 : 5);
    const ring = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).rotateX(Math.PI / 2);

    // Fan housings (four plates each) and the gravity shutters on the outside.
    const plates = new InstanceSet();
    const shutters = new InstanceSet();
    const wallZ = halfLength;
    for (const fan of fans) {
      const s = fan.size;
      const depth = 0.42 * s;
      const zc = wallZ + depth / 2 - 0.08;
      plates.add([fan.x - s / 2, fan.y, zc], [0.02, s, depth], GALV);
      plates.add([fan.x + s / 2, fan.y, zc], [0.02, s, depth], GALV);
      plates.add([fan.x, fan.y + s / 2, zc], [s, 0.02, depth], GALV);
      plates.add([fan.x, fan.y - s / 2, zc], [s, 0.02, depth], GALV);
      const blades = quality === 'lite' ? 4 : 8;
      for (let k = 0; k < blades; k += 1) {
        shutters.add([fan.x, fan.y - s / 2 + (s * (k + 0.5)) / blades, wallZ + depth - 0.07], [s - 0.04, 0.012, s / blades], '#d9dee3', 0, -0.5);
      }
    }

    // Circulation (HAF) fans hung under the trusses in every span, all blowing the same way.
    const haf = new InstanceSet();
    const hafRotors = new InstanceSet();
    const hangers = new InstanceSet();
    const hafY = G - 0.55;
    const hafZ = spaced(-halfLength + 4, halfLength - 4, 12, quality === 'lite' ? 4 : 14);
    if (length > 8) {
      for (const c of spanCentres) {
        for (const z of hafZ) {
          haf.add([c, hafY, z], [0.3, 0.3, 0.32], GALV);
          hafRotors.add([c, hafY, z + 0.02], 0.27, '#4b5563');
          hangers.add([c, (hafY + G) / 2 + 0.15, z], [0.008, G - hafY - 0.3, 0.008], '#6b7280');
        }
      }
    }

    // Pad plumbing: header pipe over the pad, gutter under it, and the sump tank with its pump.
    const plumbing = new InstanceSet();
    const padZ = -halfLength + 0.1;
    plumbing.add([(padOpening.x0 + padOpening.x1) / 2, padOpening.y1 + 0.07, padZ], [0.04, padWidth + 0.2, 0.04], '#e5e7eb', 0, 0, Math.PI / 2);
    plumbing.add([(padOpening.x0 + padOpening.x1) / 2, padOpening.y0 - 0.06, padZ + 0.04], [0.07, padWidth + 0.2, 0.07], '#9aa4ae', 0, 0, Math.PI / 2);
    plumbing.add([padOpening.x0 + 0.1, padOpening.y0 / 2, padZ + 0.04], [0.04, padOpening.y0, 0.04], '#9aa4ae');

    return {
      galv,
      dark,
      pad,
      screen,
      rotorGeometry,
      ring,
      plates,
      shutters,
      haf,
      hafRotors,
      hangers,
      plumbing,
      padWidth,
      padHeight,
      padZ,
      dispose: () => [galv, dark, pad, screen, rotorGeometry, ring, texture].forEach((item) => item?.dispose()),
    };
  }, [fans, padOpening, quality, G, halfLength, length, spanCentres]);
  useEffect(() => () => built.dispose(), [built]);

  useFrame((state, delta) => {
    if (quality === 'lite') return;
    rotors.current?.children.forEach((rotor, i) => {
      rotor.rotation.z += delta * (9 + (i % 3));
    });
    if (led.current) {
      (led.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + 0.4 * Math.sin(state.clock.elapsedTime * 3);
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelect?.();
  };
  const screenLength = length * 0.55;
  const panelX = Math.min(halfWidth - 0.6, entry.halfWidth + 0.7);

  return (
    <group name="climate-equipment" userData={{ fans: fans.length }} onPointerDown={handlePointerDown}>
      <group name="cooling-pad">
        <mesh position={[(padOpening.x0 + padOpening.x1) / 2, (padOpening.y0 + padOpening.y1) / 2, built.padZ]} material={built.pad}>
          <boxGeometry args={[built.padWidth, built.padHeight, 0.15]} />
        </mesh>
        <InstancedPart name="pad-plumbing" set={built.plumbing} geometry={geo.cylinderRound()} material={built.galv} />
        <mesh position={[padOpening.x0 + 0.35, 0.3, built.padZ + 0.45]} material={built.dark}>
          <boxGeometry args={[0.5, 0.6, 0.5]} />
        </mesh>
      </group>

      <group name="exhaust-fans">
        <InstancedPart name="fan-housings" set={built.plates} geometry={geo.box()} material={built.galv} />
        <InstancedPart name="fan-shutters" set={built.shutters} geometry={geo.box()} material={built.galv} />
        <group ref={rotors}>
          {fans.map((fan, i) => (
            <mesh key={i} geometry={built.rotorGeometry} material={built.dark} position={[fan.x, fan.y, halfLength + 0.02]} scale={fan.size * 0.46} />
          ))}
        </group>
      </group>

      <group name="circulation-fans">
        <InstancedPart name="haf-housings" set={built.haf} geometry={built.ring} material={built.galv} />
        <InstancedPart name="haf-rotors" set={built.hafRotors} geometry={built.rotorGeometry} material={built.dark} />
        <InstancedPart name="haf-hangers" set={built.hangers} geometry={geo.cylinder()} material={built.dark} />
      </group>

      {/* Shade screen drawn over the back half of the house, with its folded bundle at the leading edge. */}
      <group name="shade-screen">
        <mesh position={[0, G - 0.08, -halfLength + screenLength / 2]} rotation={[-Math.PI / 2, 0, 0]} material={built.screen} renderOrder={1}>
          <planeGeometry args={[width - 0.1, screenLength]} />
        </mesh>
        <mesh position={[0, G - 0.1, -halfLength + screenLength]} rotation={[0, 0, Math.PI / 2]} material={built.galv}>
          <cylinderGeometry args={[0.05, 0.05, width - 0.1, 10]} />
        </mesh>
      </group>

      {/* Climate controller on a stand inside the entry. */}
      <group name="climate-controller" position={[panelX, 0, halfLength - 0.45]}>
        <mesh position={[0, 1.3, 0]}>
          <boxGeometry args={[0.55, 0.7, 0.2]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.45} />
        </mesh>
        <mesh position={[0, 1.42, 0.105]}>
          <boxGeometry args={[0.32, 0.2, 0.01]} />
          <meshStandardMaterial color="#0f172a" emissive="#0ea5e9" emissiveIntensity={0.25} />
        </mesh>
        <mesh ref={led} position={[0.18, 1.18, 0.11]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.9} />
        </mesh>
        {[-0.2, 0.2].map((x) => (
          <mesh key={x} position={[x, 0.48, 0]}>
            <boxGeometry args={[0.04, 0.95, 0.04]} />
            <meshStandardMaterial color="#9aa4ae" metalness={0.4} roughness={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
