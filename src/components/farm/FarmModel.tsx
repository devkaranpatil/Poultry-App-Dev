import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { FarmConfig } from '@/types/farm';
import type { FocusTarget } from '@/lib/sceneEdit';
import { flockSize } from '@/lib/flock';
import { buildInteriorLayout, buildShedLayout, entryDepth, type RenderQuality } from './scene/shedLayout';
import { ShedEntryModel, ShedFloor, ShedFrame, ShedRoof, ShedWalls, TunnelEquipment } from './scene/ShedStructure';
import { BirdFlock, CageRows, FeedingModel, LitterFloor, SiteExtras } from './scene/ShedInterior';
import { Swap } from './scene/transitions';
import { useSizeEase } from './scene/sizeEase';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * The whole poultry shed, built up in stages: 1 plinth and floor, 2 frame, 3 roof, 4 walls and entry, 5 cages,
 * feeding and tunnel equipment, 6 birds. Each stage animates in; changing an option cross-fades the part it
 * affects; resizing eases the model to its new size. Everything is laid out once by scene/shedLayout.ts, so every
 * post, sheet and fitting lines up. See docs/3d-scene.md and docs/3d-model-references.md.
 */

type BuildStage = 1 | 2 | 3 | 4 | 5 | 6;

interface FarmModelProps {
  config: FarmConfig;
  buildStage?: BuildStage;
  quality?: RenderQuality;
  focusHighlight?: FocusTarget | null;
  /**
   * Which measurements to draw beside the shed. Only those of the selected part are passed, so the guides never
   * clutter the view when nothing is being edited.
   */
  guides?: readonly GuideKey[];
}

type GuideKey = 'length' | 'width' | 'eavesHeight' | 'ridgeHeight';
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

export function FarmModel({ config, buildStage = 6, quality = 'high', focusHighlight = null, guides = NO_GUIDES }: FarmModelProps) {
  const {
    length, width, eavesHeight, ridgeHeight, roofType, housingSystem, frameMaterial, roofSheet, sideWalls, entry,
    birdType, cageTiers, feedingSystem, stockingDensity,
  } = config;
  const rootRef = useRef<THREE.Group>(null);
  const reducedMotion = usePrefersReducedMotion();
  useSizeEase(rootRef, { width, length, height: Math.max(eavesHeight, ridgeHeight) });

  const layout = useMemo(
    () => buildShedLayout({ length, width, eavesHeight, ridgeHeight, roofType }),
    [length, width, eavesHeight, ridgeHeight, roofType]
  );
  const birds = useMemo(
    () => flockSize({ length, width, birdType, housing: housingSystem, stockingDensity }) ?? 0,
    [length, width, birdType, housingSystem, stockingDensity]
  );
  const interior = useMemo(
    () => buildInteriorLayout({ length, width, birdType, feedingSystem, cageTiers, birds, quality }),
    [length, width, birdType, feedingSystem, cageTiers, birds, quality]
  );
  const { halfWidth, halfLength } = layout;
  const closed = sideWalls === 'closed-tunnel';

  const showFloor = buildStage >= 1;
  const showFrame = buildStage >= 2;
  const showRoof = buildStage >= 3;
  const showWalls = buildStage >= 4;
  const showSystems = buildStage >= 5;
  const showBirds = buildStage >= 6;
  const entryZ = halfLength + entryDepth(entry);

  return (
    <group
      ref={rootRef}
      name="farm-model"
      userData={{
        housing: housingSystem,
        roof: roofType,
        frame: frameMaterial,
        roofSheet,
        sideWalls,
        entry,
        bird: birdType,
        feeding: feedingSystem,
        cageTiers,
        quality,
        buildStage,
        bays: layout.bays,
        birdsTotal: interior.birdsTotal,
        birdsShown: showBirds ? interior.birdsShown : 0,
      }}
    >
      <Swap id={showFloor ? `floor|${interior.mode}` : null} kind="fade">
        <group>
          <ShedFloor layout={layout} />
          <LitterFloor layout={layout} interior={interior} quality={quality} />
        </group>
      </Swap>

      <Swap id={showFrame ? `${frameMaterial}|${roofType}` : null} kind="grow" duration={0.4}>
        <ShedFrame layout={layout} frame={frameMaterial} />
      </Swap>

      <Swap id={showRoof ? `${roofType}|${roofSheet}` : null} kind="fade" duration={0.42}>
        <ShedRoof layout={layout} sheet={roofSheet} quality={quality} />
      </Swap>

      <Swap id={showWalls ? `${sideWalls}|${housingSystem}` : null} kind="rise">
        <ShedWalls layout={layout} sideWalls={sideWalls} housing={housingSystem} quality={quality} />
      </Swap>

      <Swap id={showWalls ? `${entry}|${closed}` : null} kind="rise">
        <ShedEntryModel layout={layout} entry={entry} closed={closed} quality={quality} />
      </Swap>

      <Swap id={showSystems && closed ? 'tunnel' : null} kind="rise" delay={0.1}>
        <TunnelEquipment layout={layout} quality={quality} animate={!reducedMotion} />
      </Swap>

      <Swap id={showSystems && interior.mode === 'cage' ? `cages|${cageTiers}` : null} kind="grow" duration={0.45}>
        <CageRows interior={interior} quality={quality} />
      </Swap>

      <Swap id={showSystems ? `${feedingSystem}|${interior.mode}|${cageTiers}` : null} kind="rise">
        <FeedingModel layout={layout} interior={interior} automatic={feedingSystem === 'automatic'} />
      </Swap>

      <Swap id={showSystems ? `extras|${birdType}` : null} kind="rise" delay={0.1}>
        <SiteExtras layout={layout} interior={interior} />
      </Swap>

      <Swap id={showBirds ? `${birdType}|${interior.mode}` : null} kind="grow" duration={0.5}>
        <BirdFlock interior={interior} />
      </Swap>

      {showFrame && guides.length > 0 && (
        <group name="dimension-guides">
          {guides.includes('length') ? (
            <DimensionLine start={[-halfWidth - 3, 0.5, -halfLength]} end={[-halfWidth - 3, 0.5, halfLength]} value={length} color="#22c55e" />
          ) : null}
          {guides.includes('width') ? (
            <DimensionLine start={[-halfWidth, 0.5, entryZ + 3]} end={[halfWidth, 0.5, entryZ + 3]} value={width} color="#3b82f6" />
          ) : null}
          {guides.includes('eavesHeight') ? (
            <DimensionLine start={[halfWidth + 2, 0, halfLength + 2]} end={[halfWidth + 2, eavesHeight, halfLength + 2]} value={eavesHeight} color="#f59e0b" />
          ) : null}
          {guides.includes('ridgeHeight') ? (
            <DimensionLine start={[halfWidth + 4, 0, halfLength + 2]} end={[halfWidth + 4, ridgeHeight, halfLength + 2]} value={ridgeHeight} color="#ef4444" />
          ) : null}
        </group>
      )}

      {showWalls && focusHighlight === 'entry' && <FocusMarker position={[0, Math.max(0.4, eavesHeight * 0.18), entryZ + 0.7]} color="#3b82f6" />}
      {showWalls && focusHighlight === 'walls' && !closed && (
        <FocusMarker position={[halfWidth + 0.65, Math.max(0.5, eavesHeight * 0.45), 0]} color="#f59e0b" />
      )}
      {showSystems && focusHighlight === 'feeding' && <FocusMarker position={[-halfWidth * 0.5, 0.6, -halfLength * 0.5]} color="#14b8a6" />}
      {showSystems && focusHighlight === 'fans' && closed && <FocusMarker position={[0, 1.2, -halfLength - 1.4]} color="#ef4444" />}
    </group>
  );
}
