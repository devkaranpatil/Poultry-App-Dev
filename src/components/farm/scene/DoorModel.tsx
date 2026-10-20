import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CoverMaterial, DoorEntry, StructureMaterial } from '@/components/farm/scene/legacyConfig';
import { InstanceSet, InstancedPart } from './instancing';
import type { RenderQuality } from './cropLayout';
import { geo } from './sceneGeometry';
import { DOOR_OPENING, type Antechamber } from './structureLayout';
import { FRAME_LOOK, createCoverMaterial, createCurtainMaterial } from './structureMaterials';

/**
 * The entry in the front end wall. A polyhouse is entered through a small antechamber (a double-door
 * room that keeps insects out); the selected door hangs on its outer face:
 *  single-sliding  one aluminium leaf on a top track, slid part open
 *  double-sliding  two leaves parting from the middle on a long track
 *  roll-up         film door rolled on a drum under a hood, half raised, in side guides
 *  curtain         overlapping PVC strips (net strips on a shade-net house) from a top rail
 */

interface DoorModelProps {
  type: DoorEntry;
  /** z of the front end wall. */
  wallZ: number;
  antechamber: Antechamber | null;
  structure: StructureMaterial;
  cover: CoverMaterial;
  netHouse: boolean;
  quality: RenderQuality;
  onSelect?: () => void;
}

const ALU = '#cfd6dd';

/** Rectangle frame (four bars) around an opening, as instances of a square tube. */
function frameRect(set: InstanceSet, cx: number, y0: number, w: number, h: number, z: number, bar: number, color: string) {
  set.add([cx - w / 2, y0 + h / 2, z], [bar, h, bar], color);
  set.add([cx + w / 2, y0 + h / 2, z], [bar, h, bar], color);
  set.add([cx, y0 + h, z], [bar, w + bar * 2, bar], color, 0, 0, Math.PI / 2);
  set.add([cx, y0 + bar, z], [bar, w, bar], color, 0, 0, Math.PI / 2);
}

function Leaves({ type, netHouse }: { type: DoorEntry; netHouse: boolean }) {
  const { width: w, height: h } = DOOR_OPENING[type];
  const built = useMemo(() => {
    const metal = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.3 });
    const infill = createCurtainMaterial();
    const bars = new InstanceSet();
    const panels = new InstanceSet();
    const strips = new InstanceSet();
    const stripMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: netHouse ? 0.8 : 0.5,
      roughness: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const bar = 0.025;

    // The fixed frame and the top track every door has.
    frameRect(bars, 0, 0, w + 0.08, h + 0.06, 0, bar * 1.4, ALU);
    if (type === 'single-sliding' || type === 'double-sliding') {
      const trackLength = type === 'single-sliding' ? w * 2.2 : w * 2;
      const trackX = type === 'single-sliding' ? w * 0.55 : 0;
      bars.add([trackX, h + 0.17, 0.06], [0.03, trackLength, 0.04], '#8e979f', 0, 0, Math.PI / 2);
      const leaves = type === 'single-sliding' ? [{ x: w * 0.55, width: w + 0.08 }] : [-1, 1].map((s) => ({ x: s * (w / 4 + w * 0.2), width: w / 2 + 0.04 }));
      for (const leaf of leaves) {
        frameRect(bars, leaf.x, 0.02, leaf.width, h, 0.07, bar, '#e1e6ea');
        bars.add([leaf.x, 0.02 + h * 0.45, 0.07], [bar * 0.8, leaf.width, bar * 0.8], '#e1e6ea', 0, 0, Math.PI / 2);
        panels.add([leaf.x, 0.02 + h / 2, 0.07], [leaf.width - 0.04, h - 0.04, 0.006], '#ffffff');
        for (const dx of [-leaf.width * 0.3, leaf.width * 0.3]) bars.add([leaf.x + dx, h + 0.12, 0.07], [0.02, 0.1, 0.02], '#6b7280');
        bars.add([leaf.x - (leaf.width / 2 - 0.08) * (leaf.x >= 0 ? 1 : -1), 1.05, 0.11], [0.015, 0.28, 0.015], '#4b5563');
      }
    } else if (type === 'roll-up') {
      // Drum under a hood at the top, the film lowered to about half way, a bottom bar and a pull strap.
      const drop = h * 0.5;
      bars.add([0, h + 0.18, 0.08], [0.14, w + 0.2, 0.14], '#e3efe9', 0, 0, Math.PI / 2);
      panels.add([0, h + 0.2, 0.15], [w + 0.3, 0.36, 0.02], '#cbd2d9');
      panels.add([0, h - drop / 2 + 0.05, 0.09], [w, drop, 0.006], '#ffffff');
      bars.add([0, h - drop + 0.05, 0.09], [0.022, w, 0.022], '#8e979f', 0, 0, Math.PI / 2);
      bars.add([w * 0.3, h - drop - 0.2, 0.1], [0.012, 0.5, 0.012], '#1f2937');
      for (const s of [-1, 1]) bars.add([s * (w / 2 + 0.03), h / 2, 0.06], [0.03, h, 0.04], '#9aa4ae');
    } else {
      // Overlapping strips, each about 30 cm wide, from a top rail.
      bars.add([0, h + 0.04, 0.05], [0.025, w + 0.2, 0.025], '#8e979f', 0, 0, Math.PI / 2);
      const count = Math.ceil(w / 0.22) + 1;
      for (let i = 0; i < count; i += 1) {
        const x = -w / 2 + (i * w) / (count - 1);
        strips.add([x, h / 2 + 0.02, 0.06 + (i % 2) * 0.012], [0.3, h, 0.004], netHouse ? '#2f4b32' : '#d6e7ee', (i % 2 ? 1 : -1) * 0.05);
      }
    }
    return {
      metal,
      infill,
      stripMaterial,
      bars,
      panels,
      strips,
      dispose: () => [metal, infill, stripMaterial].forEach((m) => m.dispose()),
    };
  }, [type, w, h, netHouse]);
  useEffect(() => () => built.dispose(), [built]);

  return (
    <>
      <InstancedPart name="door-bars" set={built.bars} geometry={geo.square()} material={built.metal} />
      <InstancedPart name="door-panels" set={built.panels} geometry={geo.box()} material={built.infill} />
      <InstancedPart name="door-strips" set={built.strips} geometry={geo.box()} material={built.stripMaterial} />
    </>
  );
}

/** The small entry room: frame, covered walls and roof, with the inner and outer openings. */
function AntechamberShell({ room, door, structure, cover, quality }: { room: Antechamber; door: DoorEntry; structure: StructureMaterial; cover: CoverMaterial; quality: RenderQuality }) {
  const built = useMemo(() => {
    const look = FRAME_LOOK[structure];
    const frame = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: look.metalness, roughness: look.roughness });
    const skin = createCoverMaterial(cover, quality);
    const { width: w, depth: d, height: h } = room;
    const r = 0.03 * look.thickness;
    const members = new InstanceSet();
    for (const x of [-w / 2, w / 2]) for (const z of [0, d]) members.add([x, h / 2, z], [r, h, r], look.color);
    for (const z of [0, d]) members.add([0, h, z], [r, w, r], look.color, 0, 0, Math.PI / 2);
    for (const x of [-w / 2, w / 2]) members.add([x, h, d / 2], [r, d, r], look.color, 0, Math.PI / 2);

    // Outer face with the door opening cut out.
    const opening = DOOR_OPENING[door];
    const face = new THREE.Shape();
    face.moveTo(-w / 2, 0);
    face.lineTo(-w / 2, h);
    face.lineTo(w / 2, h);
    face.lineTo(w / 2, 0);
    face.closePath();
    const hole = new THREE.Path();
    const hw = opening.width / 2 + 0.06;
    hole.moveTo(-hw, 0.03);
    hole.lineTo(-hw, opening.height + 0.05);
    hole.lineTo(hw, opening.height + 0.05);
    hole.lineTo(hw, 0.03);
    hole.closePath();
    face.holes.push(hole);
    const faceGeometry = new THREE.ShapeGeometry(face);
    const walls = new InstanceSet();
    for (const x of [-w / 2, w / 2]) walls.add([x, h / 2, d / 2], [0.004, h, d], '#ffffff');
    walls.add([0, h, d / 2], [w, 0.004, d], '#ffffff');
    return {
      frame,
      skin,
      members,
      walls,
      faceGeometry,
      straight: look.profile === 'box' ? geo.square() : geo.cylinderRound(),
      dispose: () => [frame, skin, faceGeometry].forEach((item) => item.dispose()),
    };
  }, [room, door, structure, cover, quality]);
  useEffect(() => () => built.dispose(), [built]);

  return (
    <group name="door-antechamber">
      <InstancedPart name="antechamber-frame" set={built.members} geometry={built.straight} material={built.frame} />
      <InstancedPart name="antechamber-walls" set={built.walls} geometry={geo.box()} material={built.skin} />
      <mesh name="antechamber-face" geometry={built.faceGeometry} material={built.skin} position={[0, 0, room.depth]} />
    </group>
  );
}

export function DoorModel({ type, wallZ, antechamber: room, structure, cover, netHouse, quality, onSelect }: DoorModelProps) {
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelect?.();
  };
  const outerZ = wallZ + (room ? room.depth : 0) + 0.03;
  return (
    <group name={`door-${type}`} userData={{ door: type, antechamber: Boolean(room) }} onPointerDown={handlePointerDown}>
      {room ? (
        <group position={[0, 0, wallZ]}>
          <AntechamberShell room={room} door={type} structure={structure} cover={cover} quality={quality} />
        </group>
      ) : null}
      <group position={[0, 0, outerZ]}>
        <Leaves type={type} netHouse={netHouse} />
      </group>
    </group>
  );
}
