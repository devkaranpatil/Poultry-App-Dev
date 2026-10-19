import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { InstanceSet, InstancedPart } from './instancing';
import { BED_WIDTH, type CropLayout, type RenderQuality } from './cropLayout';
import { buildCropParts } from './cropParts';
import { geo } from './sceneGeometry';
import { useSceneClock } from './sceneMaterials';

interface CropFieldProps {
  layout: CropLayout;
  quality: RenderQuality;
}

/** Raised soil beds, with plastic mulch for crops that use it. */
function GrowingBeds({ layout }: { layout: CropLayout }) {
  const { spec } = layout;
  const height = layout.baseY;
  return (
    <group name="growing-beds">
      {layout.rowX.map((x, i) => (
        <group key={`bed-${i}`} position={[x, 0, 0]}>
          <mesh position={[0, height / 2, 0]} receiveShadow>
            <boxGeometry args={[BED_WIDTH, height, layout.rowLength + 0.5]} />
            <meshStandardMaterial color={spec.bedColor} roughness={0.95} />
          </mesh>
          {spec.mulch ? (
            // Mulch film covers the top and folds down the sides of the bed.
            <mesh position={[0, height / 2 + 0.004, 0]} receiveShadow>
              <boxGeometry args={[BED_WIDTH + 0.012, height + 0.004, layout.rowLength + 0.46]} />
              <meshStandardMaterial color={spec.mulch} roughness={0.35} metalness={0.1} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}

/** Black net pots that hold each plant in a hydroponic channel. */
function NetPots({ layout }: { layout: CropLayout }) {
  const set = useMemo(() => {
    const pots = new InstanceSet();
    for (const p of layout.plants) pots.add([p.x, layout.baseY - 0.012, p.z], [0.03, 0.05, 0.03], '#16181d');
    return pots;
  }, [layout]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), []);
  useEffect(() => () => material.dispose(), [material]);
  return <InstancedPart name={`${layout.spec.id}-net-pots`} set={set} geometry={geo.cylinderRound()} material={material} />;
}

/** The crop: beds (or net pots in hydroponics) plus every plant, drawn as instanced parts. */
export function CropField({ layout, quality }: CropFieldProps) {
  useSceneClock();
  const built = useMemo(() => buildCropParts(layout, quality), [layout, quality]);
  useEffect(() => () => built.dispose(), [built]);

  return (
    <group name={`crop-${layout.spec.id}`} userData={{ crop: layout.spec.id, plants: layout.plants.length, mode: layout.mode }}>
      {layout.mode === 'soil' ? <GrowingBeds layout={layout} /> : <NetPots layout={layout} />}
      {built.parts.map((part) => (
        <InstancedPart key={part.name} name={part.name} set={part.set} geometry={part.geometry} material={part.material} />
      ))}
    </group>
  );
}
