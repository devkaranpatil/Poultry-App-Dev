import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html, AdaptiveDpr } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { FarmConfig, SetupSectionProgress } from '@/components/farm/scene/legacyConfig';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from 'next-themes';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEditHistory } from '@/hooks/useEditHistory';
import { registerModelSnapshot } from '@/lib/modelSnapshot';
import { hasSoftwareWebGL } from '@/lib/renderCapability';
import { createOrientationChannel, type OrientationChannel } from '@/lib/orientationChannel';
import {
  OPTION_LABEL_KEYS,
  PART_ORDER,
  cycleOptionPatch,
  handlesForPart,
  partForObject,
  type EditablePart,
  type ResizeKey,
} from '@/lib/sceneEdit';
import { isTypingTarget, resolveViewportKey, type ViewName } from '@/lib/viewportKeys';
import {
  ENVIRONMENT_STORAGE_KEY,
  SKY_STORAGE_KEY,
  DEFAULT_SKY,
  readEnvironmentChoice,
  readSkyChoice,
  resolveEnvironment,
  saveSceneChoice,
  sceneReach,
  type EnvironmentChoice,
  type EnvironmentId,
  type SkyId,
} from '@/lib/sceneEnvironment';
import { SceneEnvironment } from './scene/SceneEnvironment';
import { EnvironmentPicker } from './EnvironmentPicker';
import {
  formatModalLabel,
  modalAxes,
  modalClick,
  modalKey,
  modalLabel,
  modalPatch,
  modalPointer,
  startModal,
  type ModalKind,
  type ModalState,
  type ScreenPoint,
} from '@/lib/modalTransform';
import type { Vec3 } from '@/lib/viewMath';
import type { CameraPreset, CameraRequest } from './CameraController';
import { EditHandles, type DragState } from './scene/EditHandles';
import { SelectionOutline } from './scene/SelectionOutline';
import { RoofPie } from './scene/RoofPie';
import { OrientationReporter, ViewGizmo } from './ViewGizmo';
import { PropertiesPanel } from './PropertiesPanel';
import { ModeSwitch, NavigationTools, UndoRedo } from './ViewportTools';
import { PartIcon } from './OptionThumb';

/** What a G or S transform needs from the view: the house centre on screen, and metres per pixel there. */
interface ModalProjector {
  centre: (height: number) => ScreenPoint;
  metresPerPixel: () => number;
}

function ModalProjectorRegistrar({ projector }: { projector: { current: ModalProjector | null } }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    projector.current = {
      centre: (height) => {
        camera.updateMatrixWorld();
        const point = new THREE.Vector3(0, height / 2, 0).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
      },
      metresPerPixel: () => {
        const rect = gl.domElement.getBoundingClientRect();
        const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45;
        const distance = camera.position.length();
        return (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(rect.height, 1);
      },
    };
    return () => {
      projector.current = null;
    };
  }, [camera, gl, projector]);
  return null;
}

/** Exposes a capture of the current view to the report exporters. */
function SnapshotRegistrar() {
  const { gl, scene, camera } = useThree();
  useEffect(
    () =>
      registerModelSnapshot(() => {
        // Render synchronously so the buffer holds a frame even without preserveDrawingBuffer.
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/jpeg', 0.9);
      }),
    [gl, scene, camera]
  );
  return null;
}

/**
 * With frameloop="demand", asks for a frame a few times a second so the ambient animations keep
 * moving. Used on software WebGL, where rendering at the display rate blocks the page's input.
 */
function FrameRateCap({ fps }: { fps: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const timer = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [invalidate, fps]);
  return null;
}

/** Test hook: where a named object appears on screen, so a browser test can click or drag it. Not in production builds. */
function ProjectionTestHook() {
  const { camera, gl, scene } = useThree();
  useEffect(() => {
    if (import.meta.env.PROD) return undefined;
    const target = window as unknown as { __farmProject?: (name: string, centre?: boolean) => { x: number; y: number } | null };
    // `centre` aims at the middle of the object's bounds; part groups such as doors sit at the house origin.
    target.__farmProject = (name: string, centre = false) => {
      const object = scene.getObjectByName(name);
      if (!object) return null;
      camera.updateMatrixWorld();
      const world = centre ? new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()) : object.getWorldPosition(new THREE.Vector3());
      const point = world.project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
    };
    return () => {
      delete target.__farmProject;
    };
  }, [camera, gl, scene]);
  return null;
}

interface MiddlePanelProps {
  config: FarmConfig;
  isReady?: boolean;
  missingItems?: string[];
  sectionProgress?: SetupSectionProgress;
  /** When given, the model can be edited in place: select a part, drag its grips, choose its options. */
  onConfigChange?: (patch: Partial<FarmConfig>) => void;
  /**
   * The selected part, when the page shares it with a sidebar (picking a part opens its tab there,
   * and a tab selects its part here). Without these the view keeps its own selection.
   */
  selectedPart?: EditablePart | null;
  onSelectedPartChange?: (part: EditablePart | null) => void;
}

type BuildStage = 1 | 2 | 3 | 4 | 5 | 6;
type RenderQuality = 'high' | 'balanced' | 'lite';
type QualityMode = 'auto' | RenderQuality;
type FocusTarget = 'door' | 'vents' | 'irrigation' | 'climate';

const MIN_CAMERA_DISTANCE = 2;

const FOV = 45;

const FarmModel = lazy(async () => {
  const module = await import('./FarmModel');
  return { default: module.FarmModel };
});

const CameraController = lazy(async () => {
  const module = await import('./CameraController');
  return { default: module.CameraController };
});

function LoadingFallback({ label }: { label: string }) {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </Html>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
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
  onFocusRequest: (target: FocusTarget) => void;
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
  roofLabels: Record<string, string>;
  roofTitle: string;
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

function Scene({
  config,
  buildStage,
  quality,
  cameraRequest,
  focusHighlight,
  onFocusRequest,
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
  roofLabels,
  roofTitle,
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
  const revision = `${config.length}|${config.width}|${config.gutterHeight}|${config.ridgeHeight}|${config.roofType}|${config.greenhouseType}|${config.sideVentilation}|${config.doorEntry}|${config.selectedCrop}|${config.irrigationSystem}|${config.coverMaterial}|${config.structureMaterial}|${buildStage}`;

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

      {/* The greenhouse. Clicking a part selects it, double-clicking frames it. */}
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
          onFocusRequest={onFocusRequest}
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
      {editing && onConfigChange && selected === 'roof' ? (
        <RoofPie config={config} onChange={onConfigChange} labels={roofLabels} title={roofTitle} touch={touch} />
      ) : null}
      <ProjectionTestHook />
    </>
  );
}

const VIEW_PRESET: Record<ViewName, CameraPreset> = {
  auto: 'auto',
  front: 'front',
  back: 'back',
  side: 'side',
  'other-side': 'other-side',
  top: 'top',
  inside: 'inside',
  'focus-door': 'focus-door',
  'focus-vents': 'focus-vents',
  'focus-irrigation': 'focus-irrigation',
  'focus-climate': 'focus-climate',
};

const FOCUS_OF: Partial<Record<CameraPreset, FocusTarget>> = {
  'focus-door': 'door',
  'focus-vents': 'vents',
  'focus-irrigation': 'irrigation',
  'focus-climate': 'climate',
};

type CameraRequestInput = CameraRequest extends infer R ? (R extends CameraRequest ? Omit<R, 'id'> : never) : never;

export function MiddlePanel({
  config,
  isReady = false,
  missingItems = [],
  sectionProgress,
  onConfigChange,
  selectedPart: controlledPart,
  onSelectedPartChange,
}: MiddlePanelProps) {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const reducedMotion = usePrefersReducedMotion();
  const isDark = resolvedTheme === 'dark';
  const [buildStage, setBuildStage] = useState<BuildStage>(1);
  const [cameraRequest, setCameraRequest] = useState<CameraRequest | null>(null);
  const requestId = useRef(0);
  const [focusHighlight, setFocusHighlight] = useState<FocusTarget | null>(null);
  const [editMode, setEditMode] = useState(true);
  const [ownPart, setOwnPart] = useState<EditablePart | null>(null);
  // The landscape follows the location unless the grower picks one; the sky is the grower's pick.
  const [environmentChoice, setEnvironmentChoice] = useState<EnvironmentChoice>(readEnvironmentChoice);
  const [sky, setSky] = useState<SkyId>(readSkyChoice);
  const environment = resolveEnvironment(environmentChoice, config.state, config.district);
  const chooseEnvironment = useCallback((choice: EnvironmentChoice) => {
    setEnvironmentChoice(choice);
    saveSceneChoice(ENVIRONMENT_STORAGE_KEY, choice, 'auto');
  }, []);
  const chooseSky = useCallback((choice: SkyId) => {
    setSky(choice);
    saveSceneChoice(SKY_STORAGE_KEY, choice, DEFAULT_SKY);
  }, []);
  const selectedPart = controlledPart !== undefined ? controlledPart : ownPart;
  const setSelectedPart = onSelectedPartChange ?? setOwnPart;
  const [hoveredPart, setHoveredPart] = useState<EditablePart | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const orientation = useMemo(() => createOrientationChannel(), []);
  const [qualityMode, setQualityMode] = useState<QualityMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem('farm.qualityMode');
    } catch {
      // Storage blocked: use the automatic choice.
    }
    return stored === 'high' || stored === 'balanced' || stored === 'lite' || stored === 'auto' ? stored : 'auto';
  });
  const area = config.length * config.width;
  const volume = area * ((config.gutterHeight + config.ridgeHeight) / 2);
  const softwareWebGL = hasSoftwareWebGL();
  const autoQuality: RenderQuality = (() => {
    if (typeof window === 'undefined') return 'balanced';
    const nav = window.navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency ?? 8;
    const memory = nav.deviceMemory ?? 8;
    const lowEndDevice = cores <= 4 || memory <= 4;
    if (softwareWebGL || area > 700 || (lowEndDevice && area > 300)) return 'lite';
    if (area > 320 || lowEndDevice) return 'balanced';
    return 'high';
  })();
  const quality: RenderQuality = qualityMode === 'auto' ? autoQuality : qualityMode;
  const qualityLabel: Record<QualityMode, string> = {
    auto: t('middle.qualityAuto'),
    high: t('middle.qualityHigh'),
    balanced: t('middle.qualityBalanced'),
    lite: t('middle.qualityLite'),
  };
  const maxDpr = quality === 'high' ? 1.35 : quality === 'balanced' ? 1.15 : 1.0;
  const resolvedDpr = typeof window === 'undefined' ? maxDpr : Math.min(maxDpr, window.devicePixelRatio || maxDpr);
  // Software WebGL shades every pixel on the CPU: on Auto, a quarter of the pixels keeps the page responsive.
  // A quality the user picked is respected.
  const dprRange: [number, number] = softwareWebGL && qualityMode === 'auto' ? [0.5, 0.5] : [1, resolvedDpr];
  const hasBase = sectionProgress?.baseDimensions ?? (config.length > 0 && config.width > 0);
  const hasHeights =
    sectionProgress?.heights ??
    (config.gutterHeight > 0 &&
      config.ridgeHeight > 0 &&
      (config.roofType === 'flat'
        ? Math.abs(config.ridgeHeight - config.gutterHeight) < 0.001
        : config.ridgeHeight > config.gutterHeight));
  const hasTypeAndRoof = sectionProgress?.typeAndRoof ?? Boolean(config.greenhouseType && config.roofType);
  const hasMaterials = sectionProgress?.materials ?? Boolean(config.structureMaterial && config.coverMaterial);
  const hasAccess = sectionProgress?.access ?? Boolean(config.sideVentilation && config.doorEntry);
  // The location only matters for the money steps, so it never holds back the model: crops and
  // irrigation show as soon as they are chosen.
  const hasCultivation = sectionProgress?.cultivation ?? Boolean(config.selectedCrop && config.irrigationSystem);
  const targetBuildStage: BuildStage = !hasBase
    ? 1
    : !hasHeights
      ? 1
      : !(hasTypeAndRoof && hasMaterials)
        ? 2
        : !hasAccess
          ? 3
          : !hasCultivation
            ? 4
            : 6;
  const focusLabel =
    focusHighlight === 'door'
      ? t('middle.focusDoor')
      : focusHighlight === 'vents'
        ? t('middle.focusVents')
        : focusHighlight === 'irrigation'
          ? t('middle.focusIrrigation')
          : focusHighlight === 'climate'
            ? t('middle.focusClimate')
            : null;

  const canEdit = isReady && Boolean(onConfigChange);
  const editing = canEdit && editMode && buildStage >= 2;
  const history = useEditHistory(config, onConfigChange, isReady);

  const requestCamera = useCallback((input: CameraRequestInput) => {
    requestId.current += 1;
    setCameraRequest({ ...input, id: requestId.current } as CameraRequest);
  }, []);

  const goToView = useCallback(
    (view: ViewName) => {
      const preset = VIEW_PRESET[view];
      requestCamera({ kind: 'preset', preset });
      setFocusHighlight(FOCUS_OF[preset] ?? null);
    },
    [requestCamera]
  );

  const handleFocusRequest = useCallback(
    (target: FocusTarget) => goToView(`focus-${target}` as ViewName),
    [goToView]
  );

  const selectPart = useCallback(
    (part: EditablePart | null) => {
      setSelectedPart(part);
      // A phone has no room to hunt for grips: a part with grips is framed so they are all on screen.
      if (part && isMobile && handlesForPart(part, keyState.current.config).length > 0) requestCamera({ kind: 'frame', part });
    },
    [isMobile, requestCamera, setSelectedPart]
  );

  const frameSelection = useCallback(
    (part: EditablePart | null = selectedPart) => requestCamera({ kind: 'frame', part }),
    [requestCamera, selectedPart]
  );

  const setMode = useCallback((edit: boolean) => {
    setEditMode(edit);
    if (!edit) {
      setSelectedPart(null);
      setHoveredPart(null);
    }
  }, [setSelectedPart]);

  useEffect(() => {
    if (!focusHighlight) return;
    const timer = setTimeout(() => setFocusHighlight(null), 1800);
    return () => clearTimeout(timer);
  }, [focusHighlight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('farm.qualityMode', qualityMode);
    } catch {
      // The choice then lasts for this visit only.
    }
  }, [qualityMode]);

  useEffect(() => {
    if (!isReady) {
      setBuildStage(1);
      return;
    }
    if (buildStage === targetBuildStage) return;
    const timer = setTimeout(() => {
      setBuildStage((prev) => {
        if (prev < targetBuildStage) return (prev + 1) as BuildStage;
        if (prev > targetBuildStage) return (prev - 1) as BuildStage;
        return prev;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [isReady, buildStage, targetBuildStage]);

  // Whatever the keyboard handler needs, current on every press without re-binding the listener.
  const keyState = useRef({ config, selectedPart, editing, helpOpen, history, onConfigChange });
  keyState.current = { config, selectedPart, editing, helpOpen, history, onConfigChange };

  // Blender-style G (grab) and S (scale): the pointer or typed numbers change the selected part's
  // sizes live; a click or Enter keeps them, Esc or a right click puts them back. One undo step.
  const projectorRef = useRef<ModalProjector | null>(null);
  const modalRef = useRef<ModalState | null>(null);
  const pointerRef = useRef<ScreenPoint>({ x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;

  const updateModal = useCallback((next: ModalState) => {
    const { config: current, onConfigChange: apply, history: edits } = keyState.current;
    const patch = modalPatch(next);
    const diff = Object.fromEntries(
      (Object.keys(patch) as Array<keyof typeof patch>).filter((key) => patch[key] !== current[key]).map((key) => [key, patch[key]])
    );
    if (apply && Object.keys(diff).length > 0) apply(diff);
    if (next.status === 'active') {
      modalRef.current = next;
      setDragState({ key: 'length', text: formatModalLabel(modalLabel(next), (key) => tRef.current(key)) });
      return;
    }
    modalRef.current = null;
    setDragState(null);
    edits.endGroup();
  }, []);

  const beginModal = useCallback(
    (kind: ModalKind) => {
      const { config: current, selectedPart: part, history: edits } = keyState.current;
      const projector = projectorRef.current;
      if (!projector) return false;
      const state = startModal(kind, part, current, pointerRef.current, projector.centre(current.gutterHeight), projector.metresPerPixel());
      if (!state) return false;
      edits.beginGroup();
      updateModal(state);
      return true;
    },
    [updateModal]
  );

  // The pointer drives an active transform; a click ends it without reaching the scene or the orbit.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (modalRef.current) updateModal(modalPointer(modalRef.current, pointerRef.current));
    };
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    let swallowClick = false;
    const onDown = (event: PointerEvent) => {
      if (!modalRef.current) return;
      swallow(event);
      swallowClick = true;
      updateModal(modalClick(modalRef.current, event.button));
    };
    const onAfter = (event: Event) => {
      if (swallowClick) swallow(event);
      if (event.type === 'click' || event.type === 'contextmenu') swallowClick = false;
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerdown', onDown, true);
    for (const type of ['pointerup', 'click', 'contextmenu']) window.addEventListener(type, onAfter, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerdown', onDown, true);
      for (const type of ['pointerup', 'click', 'contextmenu']) window.removeEventListener(type, onAfter, true);
    };
  }, [updateModal]);

  // Leaving edit mode or changing the selection cancels a transform in progress.
  useEffect(() => {
    if (modalRef.current) updateModal(modalKey(modalRef.current, 'Escape'));
  }, [editing, selectedPart, updateModal]);

  useEffect(() => {
    if (!isReady) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const state = keyState.current;
      const modal = modalRef.current;
      if (modal) {
        // While a transform runs, every key is its own (digits would otherwise switch views).
        event.preventDefault();
        updateModal(modalKey(modal, event.key));
        return;
      }
      const canTransform = state.editing && Boolean(state.onConfigChange) && modalAxes(state.selectedPart, state.config).length > 0;
      const action = resolveViewportKey(event, { canTransform });
      if (!action) return;
      // A menu, dialog or popover with focus keeps its own keys.
      const inOverlay = event.target instanceof Element && event.target.closest('[role="dialog"],[role="menu"],[role="listbox"]');
      if (inOverlay && action.type !== 'undo' && action.type !== 'redo') return;

      switch (action.type) {
        case 'view': {
          if (action.view === 'focus-vents' && state.config.sideVentilation === 'none') return;
          if (action.view === 'focus-climate' && state.config.greenhouseType !== 'climate-controlled') return;
          event.preventDefault();
          goToView(action.view);
          return;
        }
        case 'orbit':
          event.preventDefault();
          requestCamera({ kind: 'orbit', azimuth: action.azimuth, polar: action.polar });
          return;
        case 'opposite':
          event.preventDefault();
          requestCamera({ kind: 'opposite' });
          return;
        case 'zoom':
          event.preventDefault();
          requestCamera({ kind: 'zoom', factor: action.direction > 0 ? 0.84 : 1.19 });
          return;
        case 'reset':
          event.preventDefault();
          goToView('auto');
          return;
        case 'frame':
          event.preventDefault();
          requestCamera({ kind: 'frame', part: state.selectedPart });
          return;
        case 'undo':
          if (state.history.undo()) event.preventDefault();
          return;
        case 'redo':
          if (state.history.redo()) event.preventDefault();
          return;
        case 'toggle-mode': {
          // Only when nothing has focus, so Tab still moves between controls.
          const active = document.activeElement;
          if (active && active !== document.body) return;
          if (!state.onConfigChange) return;
          event.preventDefault();
          setMode(!state.editing);
          return;
        }
        case 'help':
          event.preventDefault();
          setHelpOpen((open) => !open);
          return;
        case 'escape':
          if (state.helpOpen) {
            setHelpOpen(false);
            return;
          }
          if (state.selectedPart) {
            event.preventDefault();
            setSelectedPart(null);
          }
          return;
        case 'modal':
          if (beginModal(action.kind)) event.preventDefault();
          return;
        case 'cycle': {
          const part = state.selectedPart;
          if (!state.editing || !part || part === 'size' || !state.onConfigChange) return;
          const patch = cycleOptionPatch(part, state.config, action.direction);
          if (Object.keys(patch).length === 0) return;
          event.preventDefault();
          state.onConfigChange(patch);
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isReady, goToView, requestCamera, setMode, updateModal, beginModal, setSelectedPart]);

  // Test hook: select parts without WebGL picking, read the selection, undo. Not in production builds.
  useEffect(() => {
    if (import.meta.env.PROD) return undefined;
    const target = window as unknown as { __farmEditor?: Record<string, unknown> };
    target.__farmEditor = {
      select: (part: EditablePart | null) => {
        if (part !== null && !PART_ORDER.includes(part)) throw new Error(`Unknown part ${part}`);
        selectPart(part);
      },
      getSelected: () => keyState.current.selectedPart,
      getHandles: () => handlesForPart(keyState.current.editing ? keyState.current.selectedPart : null, keyState.current.config),
      isEditing: () => keyState.current.editing,
      undo: () => keyState.current.history.undo(),
      redo: () => keyState.current.history.redo(),
      frame: () => requestCamera({ kind: 'frame', part: keyState.current.selectedPart }),
    };
    return () => {
      delete target.__farmEditor;
    };
  }, [selectPart, requestCamera]);

  // Leaving edit mode or the model going away clears the selection and any hover.
  useEffect(() => {
    if (!editing) {
      setHoveredPart(null);
      setDragState(null);
    }
  }, [editing]);

  const handleLabels: Record<ResizeKey, string> = {
    length: t('left.length'),
    width: t('left.width'),
    gutterHeight: t('left.gutter'),
    ridgeHeight: t('left.ridge'),
  };
  const roofLabels = {
    flat: t(OPTION_LABEL_KEYS.flat),
    gable: t(OPTION_LABEL_KEYS.gable),
    gothic: t(OPTION_LABEL_KEYS.gothic),
  };
  const partName = selectedPart ? t(`edit.part.${selectedPart}`) : '';
  const hasGrips = handlesForPart(selectedPart, config).length > 0;
  const statusText = !canEdit
    ? t('middle.dragHint')
    : !editMode
      ? t('viewport.status.view')
      : !selectedPart
        ? isMobile
          ? t('viewport.status.idleTouch')
          : t('viewport.status.idle')
        : selectedPart === 'roof'
          ? t('viewport.status.roof')
          : hasGrips
            ? t('viewport.status.grips')
            : t('viewport.status.options');
  const frameLabel = selectedPart ? t('viewport.frameSelected') : t('viewport.frameAll');
  const guides = useMemo<ResizeKey[]>(
    () => (editing ? handlesForPart(selectedPart, config).filter((key): key is ResizeKey => key !== 'corner') : []),
    [editing, selectedPart, config]
  );
  const rightGutter = 12;

  return (
    <div className="relative h-full w-full panel-middle" data-panel-bounds>
      {/* The canvas fills the whole area; everything else floats over it. */}
      {/* isolate: the labels drawn into the scene stay under the panels floating over it. */}
      <div className="absolute inset-0 isolate canvas-container">
        {isReady ? (
          <div
            className="h-full w-full"
            role="img"
            aria-label={t('middle.sceneDescription', {
              length: config.length,
              width: config.width,
              type: config.greenhouseType.replace(/-/g, ' '),
              roof: config.roofType,
              structure: config.structureMaterial.replace(/-/g, ' '),
              cover: config.coverMaterial.replace(/-/g, ' '),
              crop: config.selectedCrop,
              irrigation: config.irrigationSystem.replace(/-/g, ' '),
            })}
            data-testid="scene-canvas"
            data-build-stage={buildStage}
            data-quality={quality}
            data-crop={config.selectedCrop}
            data-irrigation={config.irrigationSystem}
            data-selected={selectedPart ?? ''}
            data-mode={editMode ? 'edit' : 'view'}
          >
            <Canvas
              frameloop={softwareWebGL ? 'demand' : 'always'}
              shadows={quality !== 'lite'}
              dpr={dprRange}
              performance={{ min: 0.55 }}
              // Antialiasing wherever the GPU can afford it: without it thin frame members break into dotted lines.
              gl={{ antialias: !softwareWebGL || quality !== 'lite', powerPreference: 'high-performance' }}
              onCreated={({ gl, scene }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = quality === 'lite' ? 1 : 1.05;
                // Lets automated tests inspect what was actually built. Not exposed in production builds.
                if (!import.meta.env.PROD) (window as unknown as { __farmScene?: THREE.Scene }).__farmScene = scene;
              }}
              onPointerMissed={(event) => {
                // A click on empty ground or sky deselects, as in Blender.
                if (event.type === 'click' && editing) setSelectedPart(null);
              }}
            >
              <AdaptiveDpr pixelated />
              {softwareWebGL && <FrameRateCap fps={6} />}
              <SnapshotRegistrar />
              <ModalProjectorRegistrar projector={projectorRef} />
              <Suspense fallback={<LoadingFallback label={t('middle.loadingModel')} />}>
                <Scene
                  config={config}
                  buildStage={buildStage}
                  quality={quality}
                  cameraRequest={cameraRequest}
                  focusHighlight={focusHighlight}
                  onFocusRequest={handleFocusRequest}
                  isDark={isDark}
                  editing={editing}
                  selected={editing ? selectedPart : null}
                  hovered={hoveredPart}
                  hoverEnabled={editing && !softwareWebGL && !isMobile && !dragState}
                  onSelect={selectPart}
                  onHover={setHoveredPart}
                  onFrame={(part) => frameSelection(part)}
                  onConfigChange={onConfigChange}
                  handleLabels={handleLabels}
                  roofLabels={roofLabels}
                  roofTitle={t('viewport.pie')}
                  touch={isMobile}
                  reducedMotion={reducedMotion}
                  onDragChange={setDragState}
                  onDragStart={history.beginGroup}
                  onDragEnd={history.endGroup}
                  orientation={orientation}
                  guides={guides}
                  environment={environment}
                  sky={sky}
                />
              </Suspense>
            </Canvas>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-center">
            <div className="max-w-md">
              <p className="text-sm font-medium text-foreground">{t('middle.previewHere')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('middle.enterDims')}</p>
              {missingItems.length > 0 && (
                <div className="mt-4 rounded-lg border border-border bg-card/60 p-3 text-left">
                  <p className="mb-2 text-xs font-medium text-foreground">{t('middle.requiredBeforeRender')}</p>
                  <ul className="space-y-1">
                    {missingItems.map((item) => (
                      <li key={item} className="text-xs text-muted-foreground">- {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isReady && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {/* Header: mode, undo, what is on screen. Blender's viewport header. */}
          <div className="absolute left-3 top-3 flex max-w-[calc(100%-8rem)] flex-wrap items-center gap-2 sm:left-4">
            <div className="glass pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl p-1 pr-2.5 shadow-soft">
              {canEdit ? <ModeSwitch editMode={editMode} onChange={setMode} /> : null}
              {canEdit ? (
                <UndoRedo canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} />
              ) : null}
              <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
              <span className="pl-1 font-mono text-sm font-medium tabular-nums" data-testid="model-dimensions">
                {config.length} × {config.width} × {config.ridgeHeight} m
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {area.toFixed(0)} m² · {volume.toFixed(0)} m³
              </span>
              <label className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                <span className="sr-only">{t('middle.quality')}</span>
                <select
                  className="h-6 rounded border border-border bg-card px-1 text-[11px] text-foreground"
                  aria-label={t('middle.quality')}
                  value={qualityMode}
                  onChange={(event) => setQualityMode(event.target.value as QualityMode)}
                >
                  {(['auto', 'high', 'balanced', 'lite'] as const).map((mode) => (
                    <option key={mode} value={mode}>
                      {qualityLabel[mode]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <EnvironmentPicker
              choice={environmentChoice}
              environment={environment}
              sky={sky}
              state={config.state}
              district={config.district}
              onChoiceChange={chooseEnvironment}
              onSkyChange={chooseSky}
            />

            {/* While a grip is held the header reads out the change, as Blender does. */}
            {dragState ? (
              <div
                className="pointer-events-none rounded-lg bg-orange-500 px-2.5 py-1.5 font-mono text-xs font-semibold text-white shadow-elevated animate-in fade-in-0 slide-in-from-top-1 duration-150"
                data-testid="drag-readout"
                aria-live="polite"
              >
                {dragState.text}
                <span className="ml-2 font-sans font-normal opacity-80">{t('viewport.dragCancel')}</span>
              </div>
            ) : focusLabel ? (
              <div className="rounded-full glass px-3 py-1.5 animate-in fade-in-0 duration-200">
                <span className="text-xs font-medium text-foreground">{focusLabel}</span>
              </div>
            ) : null}
          </div>

          {/* Top right: navigation gizmo, with the view tools stacked under it. */}
          <div className="absolute top-3 flex flex-col items-center gap-2" style={{ right: rightGutter }}>
            <ViewGizmo channel={orientation} onAxis={(direction) => requestCamera({ kind: 'axis', direction })} />
            <NavigationTools
              onZoom={(direction) => requestCamera({ kind: 'zoom', factor: direction > 0 ? 0.84 : 1.19 })}
              onFrame={() => frameSelection()}
              onReset={() => goToView('auto')}
              onView={goToView}
              hasVents={config.sideVentilation !== 'none'}
              hasClimate={config.greenhouseType === 'climate-controlled'}
              helpOpen={helpOpen}
              onHelpOpenChange={setHelpOpen}
              frameLabel={frameLabel}
            />
          </div>

          {/* On a phone the part's options sit in a slim sheet under the model; on a larger screen they
              live in the design sidebar beside it. */}
          {editing && isMobile ? (
            <div className="absolute bottom-2 left-2 flex max-h-[46%] min-h-0 flex-col justify-end" style={{ right: 104 }}>
              <PropertiesPanel config={config} selected={selectedPart} onSelect={selectPart} onChange={onConfigChange!} compact open onOpenChange={() => undefined} />
            </div>
          ) : null}

          {/* Status bar: what is selected and what the pointer can do now. */}
          {!isMobile || !editing ? (
            <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-8rem)] items-center gap-2 sm:left-4">
              {editing && selectedPart ? (
                <span
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-orange-500 py-1 pl-2 pr-1 text-xs font-medium text-white shadow-elevated animate-in fade-in-0 zoom-in-95 duration-150"
                  data-testid="selection-label"
                >
                  <PartIcon part={selectedPart} className="h-3.5 w-3.5" />
                  {t('viewport.selected', { part: partName })}
                  <button
                    type="button"
                    className="ml-0.5 rounded-full px-1.5 leading-none hover:bg-white/20"
                    onClick={() => setSelectedPart(null)}
                    aria-label={t('viewport.deselect')}
                  >
                    ×
                  </button>
                </span>
              ) : null}
              <p className="glass rounded-full px-3 py-1 text-[11px] text-muted-foreground shadow-soft" data-testid="viewport-status">
                {statusText}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
