import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { FarmConfig } from '@/types/farm';
import { CropField } from './scene/CropField';
import { IrrigationSystemModel } from './scene/IrrigationSystem';
import { buildCropLayout } from './scene/cropLayout';
import { FrameModel } from './scene/FrameModel';
import { CoverModel } from './scene/CoverModel';
import { VentsModel } from './scene/VentsModel';
import { DoorModel } from './scene/DoorModel';
import { ClimateEquipment } from './scene/ClimateEquipment';
import { DOOR_OPENING, antechamber, buildStructureLayout } from './scene/structureLayout';
import type { Rect } from './scene/structureGeometry';
import { Swap, useSizeEase } from './scene/transitions';

/**
 * The whole polyhouse, built up in stages: 1 site, 2 frame, 3 cover, 4 vents and door,
 * 5 irrigation and climate equipment, 6 crop. Each stage animates in; changing an option cross-fades
 * the part it affects; resizing eases the model to its new size. The building itself lives in
 * scene/ (FrameModel, CoverModel, VentsModel, DoorModel, ClimateEquipment), all laid out from one
 * structure layout so every member, sheet and fitting lines up. See docs/3d-scene.md.
 */

type BuildStage = 1 | 2 | 3 | 4 | 5 | 6;
type RenderQuality = 'high' | 'balanced' | 'lite';
type FocusTarget = 'door' | 'vents' | 'irrigation' | 'climate';

interface FarmModelProps {
  config: FarmConfig;
  buildStage?: BuildStage;
  quality?: RenderQuality;
  focusHighlight?: FocusTarget | null;
  onFocusRequest?: (target: FocusTarget) => void;
  /**
   * Which measurements to draw beside the house. Only those of the selected part are passed, so the
   * guides never clutter the view when nothing is being edited.
   */
  guides?: readonly GuideKey[];
}

type GuideKey = 'length' | 'width' | 'gutterHeight' | 'ridgeHeight';
const NO_GUIDES: readonly GuideKey[] = [];
const noRaycast = () => null;

function FocusMarker({ position, color = '#22c55e' }: { position: [number, number, number]; color?: string }) {
  const ref = useRef<THREE.Group>(null);
  const shaftHeight = 0.95;

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    ref.current.position.y = position[1] + Math.sin(t * 4) * 0.04;
  });

  return (
    <group ref={ref} position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.9, 0.07, 12, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.75} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, shaftHeight / 2, 0]}>
        <cylinderGeometry args={[0.03, 0.03, shaftHeight, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, shaftHeight + 0.15, 0]}>
        <coneGeometry args={[0.1, 0.28, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.85} />
      </mesh>
    </group>
  );
}

function DimensionLine({
  start,
  end,
  value,
  color = '#22c55e',
}: {
  start: [number, number, number];
  end: [number, number, number];
  value: number;
  color?: string;
}) {
  const midPoint: [number, number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
  return (
    <group>
      <Line points={[start, end]} color={color} lineWidth={2} dashed dashSize={0.3} gapSize={0.15} raycast={noRaycast} />
      <mesh position={start} raycast={noRaycast}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={end} raycast={noRaycast}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* A low z-index keeps the label under the panels that float over the view. */}
      <Html position={midPoint} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="glass rounded-md px-2 py-1 text-xs font-mono whitespace-nowrap shadow-lg animate-fade-in">
          <span className="text-primary font-semibold">{value.toFixed(1)}</span>
          <span className="text-muted-foreground ml-0.5">m</span>
        </div>
      </Html>
    </group>
  );
}

/** Soil floor inside the house, with pale weed-mat walkways along both side walls and the end walls. */
function SiteFloor({ width, length }: { width: number; length: number }) {
  return (
    <group name="site-floor">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color="#7b5d43" roughness={0.97} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} rotation={[-Math.PI / 2, 0, 0]} position={[side * (width / 2 - 0.3), 0.007, 0]} receiveShadow>
          <planeGeometry args={[0.55, length - 0.1]} />
          <meshStandardMaterial color="#d9d6cc" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function FarmModel({ config, buildStage = 6, quality = 'high', focusHighlight = null, onFocusRequest, guides = NO_GUIDES }: FarmModelProps) {
  const {
    length, width, gutterHeight, ridgeHeight, roofType, coverMaterial,
    structureMaterial, greenhouseType, sideVentilation, doorEntry,
    selectedCrop, irrigationSystem,
  } = config;
  const rootRef = useRef<THREE.Group>(null);
  useSizeEase(rootRef, { width, length, height: Math.max(gutterHeight, ridgeHeight) });

  const layout = useMemo(
    () => buildStructureLayout({ length, width, gutterHeight, ridgeHeight, roofType, greenhouseType }),
    [length, width, gutterHeight, ridgeHeight, roofType, greenhouseType]
  );
  const { halfWidth, halfLength } = layout;
  const netHouse = greenhouseType === 'shade-net';
  const climate = greenhouseType === 'climate-controlled';

  const room = useMemo(() => antechamber(greenhouseType, doorEntry, gutterHeight), [greenhouseType, doorEntry, gutterHeight]);
  const entry = useMemo(() => {
    const opening = DOOR_OPENING[doorEntry];
    return room
      ? { halfWidth: room.width / 2 - 0.04, height: room.height - 0.04 }
      : { halfWidth: opening.width / 2 + 0.06, height: opening.height + 0.06 };
  }, [room, doorEntry]);
  const padOpening = useMemo<Rect | null>(
    () =>
      climate
        ? { x0: -halfWidth + 0.45, y0: 0.45, x1: halfWidth - 0.45, y1: Math.max(1.2, Math.min(gutterHeight - 0.5, 2.45)) }
        : null,
    [climate, halfWidth, gutterHeight]
  );

  // One layout feeds both the crop field and the irrigation system, so they always line up.
  const cropLayout = useMemo(
    () => buildCropLayout({ width, length, gutterHeight, crop: selectedCrop, irrigation: irrigationSystem, quality }),
    [width, length, gutterHeight, selectedCrop, irrigationSystem, quality]
  );

  const showFoundation = buildStage >= 1;
  const showFrame = buildStage >= 2;
  const showCover = buildStage >= 3;
  const showAccess = buildStage >= 4;
  const showSystems = buildStage >= 5;
  const showCrops = buildStage >= 6;
  const doorZ = halfLength + (room ? room.depth : 0);

  return (
    <group
      ref={rootRef}
      name="farm-model"
      userData={{
        crop: selectedCrop,
        irrigation: irrigationSystem,
        structureType: greenhouseType,
        roof: roofType,
        structure: structureMaterial,
        cover: coverMaterial,
        sideVentilation,
        door: doorEntry,
        quality,
        buildStage,
        spans: layout.spans,
        bays: layout.bays,
      }}
    >
      <Swap id={showFoundation ? 'site' : null} kind="fade">
        <SiteFloor width={width} length={length} />
      </Swap>

      <Swap id={showFrame ? `${structureMaterial}|${roofType}|${greenhouseType}` : null} kind="grow" duration={0.4}>
        <FrameModel layout={layout} structure={structureMaterial} quality={quality} entryHalf={entry.halfWidth} />
      </Swap>

      <Swap id={showCover ? `${greenhouseType}|${coverMaterial}|${roofType}` : null} kind="fade" duration={0.42}>
        <CoverModel
          layout={layout}
          cover={coverMaterial}
          greenhouseType={greenhouseType}
          sideVentilation={sideVentilation}
          quality={quality}
          entry={entry}
          padOpening={padOpening}
        />
      </Swap>

      <Swap id={showAccess && sideVentilation !== 'none' ? sideVentilation : null} kind="rise">
        {sideVentilation !== 'none' ? (
          <VentsModel layout={layout} type={sideVentilation} quality={quality} onSelect={() => onFocusRequest?.('vents')} />
        ) : null}
      </Swap>

      <Swap id={showAccess ? `${doorEntry}|${room ? 'room' : 'wall'}` : null} kind="rise">
        <DoorModel
          type={doorEntry}
          wallZ={halfLength}
          antechamber={room}
          structure={structureMaterial}
          cover={coverMaterial}
          netHouse={netHouse}
          quality={quality}
          onSelect={() => onFocusRequest?.('door')}
        />
      </Swap>

      <Swap id={showSystems && climate && padOpening ? 'climate' : null} kind="rise" delay={0.1}>
        {padOpening ? (
          <ClimateEquipment layout={layout} padOpening={padOpening} entry={entry} quality={quality} onSelect={() => onFocusRequest?.('climate')} />
        ) : null}
      </Swap>

      {/* Interior: the irrigation system appears with the systems stage, the crop field with the crops stage */}
      <group name="interior">
        <Swap id={showSystems ? irrigationSystem : null} kind="rise">
          <IrrigationSystemModel
            system={irrigationSystem}
            layout={cropLayout}
            halfWidth={halfWidth}
            halfLength={halfLength}
            gutterHeight={gutterHeight}
            quality={quality}
            onSelect={() => onFocusRequest?.('irrigation')}
          />
        </Swap>
        <Swap id={showCrops ? `${selectedCrop}-${cropLayout.mode}` : null} kind="grow" duration={0.5}>
          <CropField layout={cropLayout} quality={quality} />
        </Swap>
      </group>

      {showFrame && guides.length > 0 && (
        <group name="dimension-guides">
          {guides.includes('length') ? (
            <DimensionLine start={[-halfWidth - 3, 0.5, -halfLength]} end={[-halfWidth - 3, 0.5, halfLength]} value={length} color="#22c55e" />
          ) : null}
          {guides.includes('width') ? (
            <DimensionLine start={[-halfWidth, 0.5, doorZ + 3]} end={[halfWidth, 0.5, doorZ + 3]} value={width} color="#3b82f6" />
          ) : null}
          {guides.includes('gutterHeight') ? (
            <DimensionLine start={[halfWidth + 2, 0, halfLength + 2]} end={[halfWidth + 2, gutterHeight, halfLength + 2]} value={gutterHeight} color="#f59e0b" />
          ) : null}
          {guides.includes('ridgeHeight') ? (
            <DimensionLine start={[halfWidth + 4, 0, halfLength + 2]} end={[halfWidth + 4, ridgeHeight, halfLength + 2]} value={ridgeHeight} color="#ef4444" />
          ) : null}
        </group>
      )}

      {showAccess && focusHighlight === 'door' && (
        <FocusMarker position={[0, Math.max(0.4, gutterHeight * 0.18), doorZ + 0.7]} color="#3b82f6" />
      )}
      {showAccess && focusHighlight === 'vents' && sideVentilation !== 'none' && (
        <FocusMarker position={[halfWidth + 0.65, Math.max(0.5, gutterHeight * 0.45), 0]} color="#f59e0b" />
      )}
      {showSystems && focusHighlight === 'irrigation' && <FocusMarker position={[-halfWidth * 0.5, 0.6, -halfLength * 0.5]} color="#14b8a6" />}
      {showSystems && focusHighlight === 'climate' && climate && (
        <FocusMarker position={[-halfWidth + 2.1, 1.2, -halfLength + 1.9]} color="#ef4444" />
      )}
    </group>
  );
}
