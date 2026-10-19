import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FarmConfig } from '@/types/farm';
import type { EditablePart } from '@/lib/sceneEdit';
import { partBounds } from './partBounds';

/** Blender's selection orange, and the lighter tone for the part under the pointer. */
export const SELECT_COLOR = '#ff8f1f';
export const HOVER_COLOR = '#ffd0a1';

/** How long after a change the outline keeps following the model while it animates to its new size. */
const SETTLE_MS = 700;
const PADDING = 0.12;

interface OutlineBoxProps {
  part: EditablePart;
  config: FarmConfig;
  /** Changes whenever the model may have moved (config, build stage). */
  revision: string;
  color: string;
  opacity: number;
  /** Corner brackets only, as Blender draws a hovered object's bounds; else the full box. */
  brackets?: boolean;
  showOrigin?: boolean;
  name: string;
}

const UNIT_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

/** Twelve L-shaped corner marks on a unit box centred at the origin. */
const BRACKET_GEOMETRY = (() => {
  const points: number[] = [];
  const arm = 0.18;
  for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        points.push(x, y, z, x - Math.sign(x) * arm, y, z);
        points.push(x, y, z, x, y - Math.sign(y) * arm, z);
        points.push(x, y, z, x, y, z - Math.sign(z) * arm);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
})();

/**
 * A box drawn around a part of the model, found by the names of its groups in the scene, so the
 * model needs no selection code of its own. It is drawn over everything (no depth test) so a part
 * inside the house is still visible when selected.
 */
function OutlineBox({ part, config, revision, color, opacity, brackets = false, showOrigin = false, name }: OutlineBoxProps) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const groupRef = useRef<THREE.Group>(null);
  const originRef = useRef<THREE.Group>(null);
  const settleUntil = useRef(0);
  const box = useMemo(() => new THREE.Box3(), []);
  const size = useMemo(() => new THREE.Vector3(), []);
  const centre = useMemo(() => new THREE.Vector3(), []);

  const update = () => {
    const group = groupRef.current;
    if (!group) return;
    partBounds(scene, part, config, box);
    box.expandByScalar(PADDING);
    box.getSize(size);
    box.getCenter(centre);
    group.position.copy(centre);
    group.scale.set(Math.max(size.x, 0.05), Math.max(size.y, 0.05), Math.max(size.z, 0.05));
    if (originRef.current) originRef.current.position.set(centre.x, box.min.y + 0.02, centre.z);
  };

  useEffect(() => {
    settleUntil.current = performance.now() + SETTLE_MS;
    update();
    invalidate();
    // update reads the latest props through closure; it only needs to rerun when these change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, revision]);

  useFrame(() => {
    if (performance.now() > settleUntil.current) return;
    update();
    invalidate();
  });

  return (
    <>
      <group ref={groupRef} name={name}>
        <lineSegments geometry={brackets ? BRACKET_GEOMETRY : UNIT_EDGES} renderOrder={30} raycast={() => null}>
          <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
        </lineSegments>
      </group>
      {showOrigin ? (
        <group ref={originRef}>
          <mesh renderOrder={31} raycast={() => null}>
            <sphereGeometry args={[0.16, 16, 12]} />
            <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh renderOrder={30} raycast={() => null}>
            <sphereGeometry args={[0.26, 16, 12]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ) : null}
    </>
  );
}

interface SelectionOutlineProps {
  selected: EditablePart | null;
  hovered: EditablePart | null;
  config: FarmConfig;
  revision: string;
}

/** The selected part in orange with its origin dot, and the part under the pointer in a lighter tone. */
export function SelectionOutline({ selected, hovered, config, revision }: SelectionOutlineProps) {
  return (
    <group name="selection-outline">
      {hovered && hovered !== selected ? (
        <OutlineBox key={`hover-${hovered}`} name="hover-box" part={hovered} config={config} revision={revision} color={HOVER_COLOR} opacity={0.9} brackets />
      ) : null}
      {selected ? (
        <OutlineBox key={`select-${selected}`} name="selection-box" part={selected} config={config} revision={revision} color={SELECT_COLOR} opacity={0.95} showOrigin />
      ) : null}
    </group>
  );
}
