import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { IrrigationSystem as IrrigationId } from '@/types/greenhouse';
import { InstancedPart } from './instancing';
import type { CropLayout, RenderQuality } from './cropLayout';
import { buildIrrigationParts } from './irrigationParts';
import { useSceneClock } from './sceneMaterials';

interface IrrigationSystemProps {
  system: IrrigationId;
  layout: CropLayout;
  halfWidth: number;
  halfLength: number;
  gutterHeight: number;
  quality: RenderQuality;
  onSelect?: () => void;
}

const TANK_COLOR: Record<IrrigationId, string> = {
  drip: '#1d4ed8',
  sprinkler: '#0f766e',
  fogger: '#475569',
  'hydroponic-nft': '#0e7490',
};

/** Pump house beside the greenhouse: tank, pump and filter, plus the extra kit each system needs. */
function HeadUnit({ system, x, z }: { system: IrrigationId; x: number; z: number }) {
  return (
    <group name={`pump-house-${system}`} position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[3.2, 0.04, 1.7]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.9} />
      </mesh>

      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.45, 1.1, 20]} />
        <meshStandardMaterial color={TANK_COLOR[system]} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.17, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.06, 16]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>

      <mesh position={[1.0, 0.2, 0.1]} castShadow>
        <boxGeometry args={[0.42, 0.28, 0.3]} />
        <meshStandardMaterial color={system === 'fogger' ? '#111827' : '#2563eb'} roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[1.0, 0.2, -0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.3, 14]} />
        <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.5} />
      </mesh>

      {system !== 'hydroponic-nft' && (
        <group position={[0.55, 0, 0.55]}>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.5, 14]} />
            <meshStandardMaterial color="#9ca3af" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.58, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.07, 14]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
        </group>
      )}

      {system === 'drip' && (
        <mesh position={[-0.85, 0.28, 0.35]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.5, 16]} />
          <meshStandardMaterial color="#facc15" roughness={0.5} />
        </mesh>
      )}
      {system === 'fogger' && (
        <mesh position={[-0.8, 0.35, 0.4]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.7, 14]} />
          <meshStandardMaterial color="#64748b" roughness={0.35} metalness={0.6} />
        </mesh>
      )}
      {system === 'hydroponic-nft' && (
        <group position={[-0.85, 0, 0.3]}>
          <mesh position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.3, 12]} />
            <meshStandardMaterial color="#f97316" roughness={0.5} />
          </mesh>
          <mesh position={[0.2, 0.17, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.3, 12]} />
            <meshStandardMaterial color="#22c55e" roughness={0.5} />
          </mesh>
          <mesh position={[0.1, 0.55, -0.35]}>
            <boxGeometry args={[0.4, 0.3, 0.12]} />
            <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** The irrigation system: pipes, emitters, moving water and the pump house. */
export function IrrigationSystemModel({ system, layout, halfWidth, halfLength, gutterHeight, quality, onSelect }: IrrigationSystemProps) {
  useSceneClock();
  const built = useMemo(
    () => buildIrrigationParts(system, { layout, halfWidth, halfLength, gutterHeight, quality }),
    [system, layout, halfWidth, halfLength, gutterHeight, quality]
  );
  useEffect(() => () => built.dispose(), [built]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelect?.();
  };

  return (
    <group name={`irrigation-${system}`} userData={{ irrigation: system, mode: layout.mode }} onPointerDown={handlePointerDown}>
      {built.parts.map((part) => (
        <InstancedPart key={part.name} name={part.name} set={part.set} geometry={part.geometry} material={part.material} />
      ))}
      <HeadUnit system={system} x={built.head.x} z={built.head.z} />
    </group>
  );
}
