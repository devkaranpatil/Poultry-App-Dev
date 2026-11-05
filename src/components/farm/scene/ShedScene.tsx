// The shed scene inside the canvas: camera, orbit controls, environment, the model and its edit handles.
import { lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import type * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { FarmConfig } from '@/types/farm';
import { partForObject, type EditablePart, type FocusTarget, type ResizeKey } from '@/lib/sceneEdit';
import { sceneReach, type EnvironmentId, type SkyId } from '@/lib/sceneEnvironment';
import type { OrientationChannel } from '@/lib/orientationChannel';
import type { Vec3 } from '@/lib/viewMath';
import type { CameraRequest } from '../CameraController';
import { OrientationReporter } from '../ViewGizmo';
import { SceneEnvironment } from './SceneEnvironment';
import { EditHandles, type DragState } from './EditHandles';
import { SelectionOutline } from './SelectionOutline';
import { ProjectionTestHook } from './canvasHelpers';

export type BuildStage = 1 | 2 | 3 | 4 | 5 | 6;
export type RenderQuality = 'high' | 'balanced' | 'lite';

const MIN_CAMERA_DISTANCE = 2;

const FOV = 45;

const FarmModel = lazy(async () => {
  const module = await import('../FarmModel');
  return { default: module.FarmModel };
});

const CameraController = lazy(async () => {
  const module = await import('../CameraController');
  return { default: module.CameraController };
});

export function LoadingFallback({ label }: { label: string }) {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </Html>
  );
}

const isHandleObject = (object: THREE.Object3D | undefined) => {
  let current: THREE.Object3D | null = object ?? null;
  while (current) {
    if (current.name === 'edit-handles') return true;
    current = current.parent;
  }
  return false;
};

interface SceneProps {
  config: FarmConfig;
  buildStage: BuildStage;
  quality: RenderQuality;
  cameraRequest: CameraRequest | null;
  focusHighlight: FocusTarget | null;
  isDark: boolean;
  editing: boolean;
  selected: EditablePart | null;
  hovered: EditablePart | null;
  hoverEnabled: boolean;
  onSelect: (part: EditablePart | null) => void;
  onHover: (part: EditablePart | null) => void;
  onFrame: (part: EditablePart) => void;
  onConfigChange?: (patch: Partial<FarmConfig>) => void;
  handleLabels: Record<ResizeKey, string>;
  touch: boolean;
  reducedMotion: boolean;
  onDragChange: (state: DragState | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  orientation: OrientationChannel;
  /** Measurements drawn beside the house: those of the selected part only. */
  guides: readonly ResizeKey[];
  environment: EnvironmentId;
  sky: SkyId;
}

export function Scene({
  config,
  buildStage,
  quality,
  cameraRequest,
  focusHighlight,
  isDark,
  editing,
  selected,
  hovered,
  hoverEnabled,
  onSelect,
  onHover,
  onFrame,
  onConfigChange,
  handleLabels,
  touch,
  reducedMotion,
  onDragChange,
  onDragStart,
  onDragEnd,
  orientation,
  guides,
  environment,
  sky,
}: SceneProps) {
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const gl = useThree((state) => state.gl);
  // The starting camera spot only; afterwards config changes must never move the camera.
  const [initialPosition] = useState<Vec3>(() => [config.width * 1.5, config.ridgeHeight * 2, config.length * 1.2]);
  const reach = sceneReach(config.length, config.width);
  const cameraLimits = useMemo(
    () => ({ minDistance: MIN_CAMERA_DISTANCE, maxDistance: reach.maxDistance }),
    [reach.maxDistance]
  );
  const revision = `${config.length}|${config.width}|${config.eavesHeight}|${config.ridgeHeight}|${config.housingSystem}|${config.roofType}|${config.frameMaterial}|${config.roofSheet}|${config.sideWalls}|${config.entry}|${config.birdType}|${config.cageTiers}|${config.feedingSystem}|${config.stockingDensity}|${buildStage}`;

  useEffect(() => {
    gl.domElement.style.cursor = editing && hovered ? 'pointer' : '';
  }, [gl, editing, hovered]);

  const partAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const first = event.intersections[0]?.object;
    if (isHandleObject(first)) return undefined; // a grip in front of the model takes the pointer
    return partForObject(event.object);
  };

  return (
    <>
      <PerspectiveCamera makeDefault position={initialPosition} fov={FOV} />
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.08}
        minDistance={cameraLimits.minDistance}
        maxDistance={cameraLimits.maxDistance}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
      <CameraController
        config={config}
        orbitControlsRef={orbitControlsRef}
        request={cameraRequest}
        reducedMotion={reducedMotion}
        limits={cameraLimits}
      />
      <OrientationReporter channel={orientation} />

      <SceneEnvironment
        environment={environment}
        sky={sky}
        quality={quality}
        isDark={isDark}
        reach={reach}
        length={config.length}
        width={config.width}
        height={config.ridgeHeight}
      />

      {/* The shed. Clicking a part selects it, double-clicking frames it. */}
      <group
        onClick={(event) => {
          // A finger wobbles more than a mouse: allow more travel before a tap counts as a drag.
          if (!editing || event.delta > (touch ? 14 : 6)) return;
          const part = partAt(event);
          if (part === undefined) return;
          event.stopPropagation();
          onSelect(part);
        }}
        onDoubleClick={(event) => {
          if (!editing) return;
          const part = partAt(event);
          if (!part) return;
          event.stopPropagation();
          onSelect(part);
          onFrame(part);
        }}
        onPointerMove={
          hoverEnabled
            ? (event) => {
                const part = partAt(event);
                if (part === undefined) return;
                event.stopPropagation();
                if (part !== hovered) onHover(part);
              }
            : undefined
        }
        onPointerOut={hoverEnabled ? () => onHover(null) : undefined}
      >
        <FarmModel
          config={config}
          buildStage={buildStage}
          quality={quality}
          focusHighlight={focusHighlight}
          guides={guides}
        />
      </group>

      {editing ? <SelectionOutline selected={selected} hovered={hoverEnabled ? hovered : null} config={config} revision={revision} /> : null}
      {editing && onConfigChange ? (
        <EditHandles
          config={config}
          part={selected}
          onChange={onConfigChange}
          orbitControlsRef={orbitControlsRef}
          labels={handleLabels}
          touch={touch}
          reducedMotion={reducedMotion}
          onDragChange={onDragChange}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : null}
      <ProjectionTestHook />
    </>
  );
}
