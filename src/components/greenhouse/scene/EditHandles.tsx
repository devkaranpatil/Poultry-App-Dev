import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { GreenhouseConfig } from '@/types/greenhouse';
import {
  HANDLE_GAP,
  RIDGE_GAP,
  cornerPatch,
  dragReadout,
  handleValue,
  handlesForPart,
  resizePatch,
  type EditablePart,
  type HandleKey,
  type ResizeKey,
} from '@/lib/sceneEdit';
import { DOOR_OPENING, antechamber } from './structureLayout';

/** What the view shows in its header while a grip is held. */
export interface DragState {
  key: HandleKey;
  text: string;
}

interface EditHandlesProps {
  config: GreenhouseConfig;
  part: EditablePart | null;
  onChange: (patch: Partial<GreenhouseConfig>) => void;
  orbitControlsRef: React.RefObject<OrbitControlsImpl | null>;
  labels: Record<ResizeKey, string>;
  /** Larger grips for fingers. */
  touch: boolean;
  reducedMotion: boolean;
  onDragChange?: (state: DragState | null) => void;
  /** Called around a drag so it undoes as one step. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

type Axis = 'x' | 'y' | 'z';

interface HandleDef {
  key: HandleKey;
  /** The axis the grip slides along; the corner slides on the ground. */
  axis: Axis | 'ground';
  position: THREE.Vector3;
  color: string;
  cursor: string;
}

/** Axis colours as in the orientation gizmo: X red, Y (up) green, Z blue. */
const AXIS_COLOR: Record<Axis, string> = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' };
const ACTIVE_COLOR = '#ff8f1f';
const CORNER_COLOR = '#f8fafc';
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_VECTOR: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const dimensionsOf = (config: GreenhouseConfig) => ({
  length: config.length,
  width: config.width,
  gutterHeight: config.gutterHeight,
  ridgeHeight: config.ridgeHeight,
});

/** A plane that contains the drag axis and faces the camera as squarely as it can. */
function dragPlane(axis: Axis | 'ground', anchor: THREE.Vector3, camera: THREE.Camera): THREE.Plane {
  if (axis === 'ground') return new THREE.Plane().setFromNormalAndCoplanarPoint(UP, anchor);
  const direction = AXIS_VECTOR[axis];
  const toCamera = new THREE.Vector3().subVectors(camera.position, anchor).normalize();
  const normal = toCamera.sub(direction.clone().multiplyScalar(toCamera.dot(direction)));
  if (normal.lengthSq() < 1e-6) normal.copy(axis === 'y' ? new THREE.Vector3(0, 0, 1) : UP);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), anchor);
}

/** A push-pull arrow: shaft and cone pointing along the axis, Blender style. */
function Arrow({ direction, size, color, opacity }: { direction: THREE.Vector3; size: number; color: string; opacity: number }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()), [direction]);
  return (
    <group quaternion={quaternion}>
      <mesh position={[0, size * 0.45, 0]} renderOrder={22}>
        <cylinderGeometry args={[size * 0.07, size * 0.07, size * 0.9, 10]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <mesh position={[0, size * 1.1, 0]} renderOrder={22}>
        <coneGeometry args={[size * 0.26, size * 0.5, 18]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <mesh renderOrder={22}>
        <sphereGeometry args={[size * 0.16, 14, 10]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={opacity} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Grips on the selected part that resize the house by dragging it, like Blender's transform gizmo:
 * push-pull arrows on the end wall (length) and side wall (width), a corner grip for both, the eave
 * for the gutter height and the ridge for the roof height. The pointer is followed with window
 * listeners and a ray against a plane through the drag axis, so the grip keeps tracking when the
 * pointer leaves it; the camera is held still while a grip is held and Esc puts everything back.
 */
export function EditHandles({
  config,
  part,
  onChange,
  orbitControlsRef,
  labels,
  touch,
  reducedMotion,
  onDragChange,
  onDragStart,
  onDragEnd,
}: EditHandlesProps) {
  const { camera, gl, invalidate } = useThree();
  const [active, setActive] = useState<HandleKey | null>(null);
  const [hovered, setHovered] = useState<HandleKey | null>(null);
  const [startValues, setStartValues] = useState<ReturnType<typeof dimensionsOf> | null>(null);
  const configRef = useRef(config);
  const callbacks = useRef({ onChange, onDragChange, onDragStart, onDragEnd, labels });
  const cleanupRef = useRef<(() => void) | null>(null);
  const appearRef = useRef<THREE.Group>(null);
  const appear = useRef(reducedMotion ? 1 : 0);
  useEffect(() => {
    configRef.current = config;
    callbacks.current = { onChange, onDragChange, onDragStart, onDragEnd, labels };
  });

  const keys = handlesForPart(part, config);
  const halfLength = config.length / 2;
  const halfWidth = config.width / 2;
  const size = THREE.MathUtils.clamp(0.7 + Math.max(config.length, config.width) * 0.012, 0.8, 1.8);
  const hitRadius = size * (touch ? 1.5 : 0.95);
  // The length grip stands off to one side of the door end, so it never covers the door or the
  // entry room: the door stays easy to click and the grip easy to grab.
  const room = antechamber(config.greenhouseType, config.doorEntry, config.gutterHeight);
  const entryHalf = room ? room.width / 2 : DOOR_OPENING[config.doorEntry].width / 2;
  const lengthX = -Math.min(Math.max(halfWidth - 0.3, 0), Math.max(halfWidth * 0.55, entryHalf + size * 0.6 + 0.3));

  const handles = useMemo<HandleDef[]>(() => {
    const all: Record<HandleKey, HandleDef> = {
      length: {
        key: 'length',
        axis: 'z',
        position: new THREE.Vector3(lengthX, Math.max(config.gutterHeight * 0.45, 1), halfLength + HANDLE_GAP),
        color: AXIS_COLOR.z,
        cursor: 'ns-resize',
      },
      width: {
        key: 'width',
        axis: 'x',
        position: new THREE.Vector3(halfWidth + HANDLE_GAP, Math.max(config.gutterHeight * 0.45, 1), 0),
        color: AXIS_COLOR.x,
        cursor: 'ew-resize',
      },
      corner: {
        key: 'corner',
        axis: 'ground',
        position: new THREE.Vector3(halfWidth + HANDLE_GAP, 0.25, halfLength + HANDLE_GAP),
        color: CORNER_COLOR,
        cursor: 'nwse-resize',
      },
      gutterHeight: {
        key: 'gutterHeight',
        axis: 'y',
        position: new THREE.Vector3(halfWidth + 0.3, config.gutterHeight, halfLength * 0.5),
        color: AXIS_COLOR.y,
        cursor: 'ns-resize',
      },
      ridgeHeight: {
        key: 'ridgeHeight',
        axis: 'y',
        position: new THREE.Vector3(0, config.ridgeHeight + RIDGE_GAP, halfLength * 0.5),
        color: AXIS_COLOR.y,
        cursor: 'ns-resize',
      },
    };
    return keys.map((key) => all[key]);
    // keys is derived from part and roofType, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, config.roofType, config.gutterHeight, config.ridgeHeight, halfLength, halfWidth, lengthX]);

  // Grips grow in when a part is selected.
  useEffect(() => {
    appear.current = reducedMotion ? 1 : 0;
    invalidate();
  }, [part, reducedMotion, invalidate]);
  useFrame((_, delta) => {
    const group = appearRef.current;
    if (!group) return;
    if (appear.current < 1) {
      appear.current = Math.min(1, appear.current + delta / 0.22);
      invalidate();
    }
    const eased = 1 - Math.pow(1 - appear.current, 3);
    group.scale.setScalar(Math.max(eased, 0.001));
  });

  // Releasing on unmount (part deselected mid-drag) so the camera is never left frozen.
  useEffect(() => () => cleanupRef.current?.(), []);

  // Reused on every pointer move; callers use the returned point before the next move.
  const scratch = useMemo(() => ({ raycaster: new THREE.Raycaster(), ndc: new THREE.Vector2(), hit: new THREE.Vector3() }), []);
  const rayHit = useCallback(
    (event: PointerEvent, plane: THREE.Plane) => {
      const rect = gl.domElement.getBoundingClientRect();
      scratch.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      scratch.raycaster.setFromCamera(scratch.ndc, camera);
      return scratch.raycaster.ray.intersectPlane(plane, scratch.hit);
    },
    [camera, gl, scratch]
  );

  const beginDrag = useCallback(
    (handle: HandleDef, event: ThreeEvent<PointerEvent>) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.stopPropagation();
      cleanupRef.current?.();
      const anchor = handle.position.clone();
      const plane = dragPlane(handle.axis, anchor, camera);
      const first = rayHit(event.nativeEvent, plane)?.clone() ?? anchor.clone();
      const grabOffset = first.clone().sub(anchor);
      const start = dimensionsOf(configRef.current);
      const pointerId = event.nativeEvent.pointerId;

      const controls = orbitControlsRef.current;
      const hadControls = controls?.enabled ?? false;
      if (controls) controls.enabled = false;
      try {
        gl.domElement.setPointerCapture(pointerId);
      } catch {
        // A synthetic pointer cannot be captured; the window listeners still follow it.
      }
      setActive(handle.key);
      setStartValues(start);
      gl.domElement.style.cursor = handle.cursor;
      callbacks.current.onDragStart?.();

      const report = (config: GreenhouseConfig) => {
        const { labels: names, onDragChange: notify } = callbacks.current;
        if (!notify) return;
        if (handle.key === 'corner') {
          notify({
            key: 'corner',
            text: `${dragReadout(names.length, config.length, start.length)} · ${dragReadout(names.width, config.width, start.width)}`,
          });
        } else {
          notify({ key: handle.key, text: dragReadout(names[handle.key], config[handle.key], start[handle.key]) });
        }
      };
      report(configRef.current);

      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const hit = rayHit(moveEvent, plane);
        if (!hit) return;
        const point = hit.sub(grabOffset);
        const current = configRef.current;
        const patch =
          handle.axis === 'ground'
            ? cornerPatch(current, point.x, point.z)
            : resizePatch(current, handle.key as ResizeKey, handleValue(handle.key as ResizeKey, point[handle.axis]));
        if (Object.keys(patch).length > 0) {
          callbacks.current.onChange(patch);
          report({ ...current, ...patch });
        }
      };
      const finish = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        window.removeEventListener('keydown', cancelKey, true);
        try {
          gl.domElement.releasePointerCapture(pointerId);
        } catch {
          // Already released.
        }
        if (controls && hadControls) controls.enabled = true;
        cleanupRef.current = null;
        setActive(null);
        setStartValues(null);
        gl.domElement.style.cursor = '';
        callbacks.current.onDragChange?.(null);
        callbacks.current.onDragEnd?.();
      };
      const end = (endEvent: PointerEvent) => {
        if (endEvent.pointerId === pointerId) finish();
      };
      // Esc puts the house back the way it was when the grip was taken (Blender's cancel).
      const cancelKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== 'Escape') return;
        keyEvent.preventDefault();
        keyEvent.stopImmediatePropagation();
        const current = configRef.current;
        const revert: Partial<GreenhouseConfig> = {};
        for (const key of Object.keys(start) as ResizeKey[]) {
          if (current[key] !== start[key]) revert[key] = start[key];
        }
        if (Object.keys(revert).length > 0) callbacks.current.onChange(revert);
        finish();
      };
      cleanupRef.current = finish;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      window.addEventListener('keydown', cancelKey, true);
    },
    [camera, gl, orbitControlsRef, rayHit]
  );

  if (handles.length === 0) return null;

  const activeHandle = handles.find((handle) => handle.key === active) ?? null;

  return (
    <group name="edit-handles">
      <group ref={appearRef}>
        {handles.map((handle) => {
          const isActive = active === handle.key;
          const isHovered = hovered === handle.key;
          const emphasis = isActive ? 1.2 : isHovered ? 1.1 : 1;
          const color = isActive ? ACTIVE_COLOR : handle.color;
          const opacity = active && !isActive ? 0.35 : 0.95;
          const value =
            handle.key === 'corner' ? `${config.length} × ${config.width} m` : `${config[handle.key]} m`;
          const label =
            isActive && startValues
              ? handle.key === 'corner'
                ? `${dragReadout(labels.length, config.length, startValues.length)} · ${dragReadout(labels.width, config.width, startValues.width)}`
                : dragReadout(labels[handle.key], config[handle.key], startValues[handle.key])
              : handle.key === 'corner'
                ? `${labels.length} × ${labels.width} ${value}`
                : `${labels[handle.key]} ${value}`;
          const showLabel = isActive || (isHovered && !active);
          return (
            <group
              key={handle.key}
              name={`handle-${handle.key}`}
              position={handle.position}
              userData={{ handle: handle.key }}
              onPointerDown={(event) => beginDrag(handle, event)}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(handle.key);
                if (!active) gl.domElement.style.cursor = handle.cursor;
              }}
              onPointerOut={() => {
                setHovered((current) => (current === handle.key ? null : current));
                if (!active) gl.domElement.style.cursor = '';
              }}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <group scale={emphasis}>
                {handle.axis === 'ground' ? (
                  <>
                    <mesh renderOrder={22} rotation={[Math.PI / 4, Math.PI / 4, 0]}>
                      <boxGeometry args={[size * 0.42, size * 0.42, size * 0.42]} />
                      <meshBasicMaterial color={isActive ? ACTIVE_COLOR : CORNER_COLOR} depthTest={false} transparent opacity={opacity} toneMapped={false} />
                    </mesh>
                    <mesh renderOrder={21} rotation={[-Math.PI / 2, 0, 0]}>
                      <ringGeometry args={[size * 0.5, size * 0.62, 32]} />
                      <meshBasicMaterial color={ACTIVE_COLOR} depthTest={false} transparent opacity={opacity * 0.9} side={THREE.DoubleSide} toneMapped={false} />
                    </mesh>
                  </>
                ) : (
                  <Arrow direction={AXIS_VECTOR[handle.axis]} size={size} color={color} opacity={opacity} />
                )}
              </group>
              {/* A generous invisible target, larger again on touch screens. */}
              <mesh visible={false}>
                <sphereGeometry args={[hitRadius, 12, 8]} />
                <meshBasicMaterial />
              </mesh>
              {showLabel ? (
                <Html center position={[0, size * 1.9, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
                  <div
                    className={
                      'whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium shadow-sm ' +
                      (isActive ? 'border-orange-500 bg-orange-500 text-white' : 'border-border bg-card/95 text-foreground')
                    }
                  >
                    {label}
                  </div>
                </Html>
              ) : null}
            </group>
          );
        })}

        {/* Edges that can be grabbed directly: the eave for the gutter, the ridge for the roof. */}
        {keys.includes('gutterHeight') ? (
          <mesh
            name="handle-eave"
            position={[halfWidth, config.gutterHeight, 0]}
            onPointerDown={(event) => beginDrag(handles.find((h) => h.key === 'gutterHeight')!, event)}
            onPointerOver={(event) => {
              event.stopPropagation();
              setHovered('gutterHeight');
              if (!active) gl.domElement.style.cursor = 'ns-resize';
            }}
            onPointerOut={() => {
              setHovered((current) => (current === 'gutterHeight' ? null : current));
              if (!active) gl.domElement.style.cursor = '';
            }}
            onClick={(event) => event.stopPropagation()}
            renderOrder={21}
          >
            <boxGeometry args={[touch ? 0.6 : 0.3, touch ? 0.6 : 0.3, config.length]} />
            <meshBasicMaterial
              color={active === 'gutterHeight' ? ACTIVE_COLOR : AXIS_COLOR.y}
              transparent
              opacity={active === 'gutterHeight' || hovered === 'gutterHeight' ? 0.75 : 0.22}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        ) : null}
        {keys.includes('ridgeHeight') ? (
          <mesh
            name="handle-ridge"
            position={[0, config.ridgeHeight, 0]}
            onPointerDown={(event) => beginDrag(handles.find((h) => h.key === 'ridgeHeight')!, event)}
            onPointerOver={(event) => {
              event.stopPropagation();
              setHovered('ridgeHeight');
              if (!active) gl.domElement.style.cursor = 'ns-resize';
            }}
            onPointerOut={() => {
              setHovered((current) => (current === 'ridgeHeight' ? null : current));
              if (!active) gl.domElement.style.cursor = '';
            }}
            onClick={(event) => event.stopPropagation()}
            renderOrder={21}
          >
            <boxGeometry args={[touch ? 0.6 : 0.3, touch ? 0.6 : 0.3, config.length]} />
            <meshBasicMaterial
              color={active === 'ridgeHeight' ? ACTIVE_COLOR : AXIS_COLOR.y}
              transparent
              opacity={active === 'ridgeHeight' || hovered === 'ridgeHeight' ? 0.75 : 0.22}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        ) : null}
      </group>

      {/* While dragging, the constraint axis runs through the grip, as in Blender. */}
      {activeHandle && activeHandle.axis !== 'ground' ? (
        <AxisLine axis={activeHandle.axis} through={activeHandle.position} />
      ) : null}
    </group>
  );
}

function AxisLine({ axis, through }: { axis: Axis; through: THREE.Vector3 }) {
  const geometry = useMemo(() => {
    const direction = AXIS_VECTOR[axis].clone().multiplyScalar(axis === 'y' ? 40 : 160);
    const points = [through.clone().sub(direction), through.clone().add(direction)];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [axis, through]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} renderOrder={20} raycast={() => null}>
      <lineBasicMaterial color={AXIS_COLOR[axis]} transparent opacity={0.7} depthTest={false} toneMapped={false} />
    </lineSegments>
  );
}
