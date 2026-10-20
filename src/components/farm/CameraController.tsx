import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { FarmConfig } from '@/types/farm';
import type { EditablePart } from '@/lib/sceneEdit';
import {
  axisView,
  easeInOutCubic,
  frameView,
  houseBox,
  interpolateView,
  oppositeView,
  orbitView,
  presetView,
  transitionDuration,
  zoomView,
  type CameraPreset,
  type Vec3,
  type View,
} from '@/lib/viewMath';
import { ORBIT_STEP } from '@/lib/viewportKeys';
import { partBounds } from './scene/partBounds';

export type { CameraPreset } from '@/lib/viewMath';

/** Something the view was asked to do with the camera. Each request carries a fresh id. */
export type CameraRequest = { id: number } & (
  | { kind: 'preset'; preset: CameraPreset }
  | { kind: 'frame'; part: EditablePart | null }
  | { kind: 'axis'; direction: Vec3 }
  | { kind: 'orbit'; azimuth: number; polar: number }
  | { kind: 'opposite' }
  | { kind: 'zoom'; factor: number }
);

interface CameraControllerProps {
  config: FarmConfig;
  orbitControlsRef: React.RefObject<OrbitControlsImpl | null>;
  request: CameraRequest | null;
  reducedMotion: boolean;
  /** Controls distance limits, so a framed part is never pushed back out by the orbit. */
  limits: { minDistance: number; maxDistance: number };
}

const toVec = (vector: THREE.Vector3): Vec3 => [vector.x, vector.y, vector.z];

/**
 * Moves the camera when the view asks: named views, framing a part, the gizmo axes, numpad orbit
 * steps and zoom. Moves swing around the target with an eased curve (instant for reduced motion),
 * and any orbit by the user cancels a move in progress. Config changes never move the camera, so
 * resizing the house does not make the view jump.
 */
export function CameraController({ config, orbitControlsRef, request, reducedMotion, limits }: CameraControllerProps) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const configRef = useRef(config);
  configRef.current = config;
  const initializedRef = useRef(false);
  const handledRef = useRef<number | null>(null);
  const transitionRef = useRef<{ from: View; to: View; elapsed: number; duration: number } | null>(null);

  const currentView = useCallback((): View => {
    const target = orbitControlsRef.current?.target ?? new THREE.Vector3();
    return { position: toVec(camera.position), target: toVec(target) };
  }, [camera, orbitControlsRef]);

  const apply = useCallback(
    (view: View) => {
      camera.position.set(...view.position);
      const controls = orbitControlsRef.current;
      if (controls) {
        controls.target.set(...view.target);
        controls.update();
      } else {
        camera.lookAt(...view.target);
      }
    },
    [camera, orbitControlsRef]
  );

  const moveTo = useCallback(
    (to: View) => {
      const from = currentView();
      const duration = transitionDuration(from, to, reducedMotion);
      if (duration <= 0) {
        transitionRef.current = null;
        apply(to);
      } else {
        transitionRef.current = { from, to, elapsed: 0, duration };
      }
      invalidate();
    },
    [apply, currentView, invalidate, reducedMotion]
  );

  // The first view is set without a move; the controls may mount a moment after the camera.
  useFrame(() => {
    if (initializedRef.current || !orbitControlsRef.current) return;
    initializedRef.current = true;
    apply(presetView('auto', configRef.current));
  });

  // The user taking hold of the view stops a move in progress, so the camera never fights them.
  useEffect(() => {
    const controls = orbitControlsRef.current;
    if (!controls) return undefined;
    const stop = () => {
      transitionRef.current = null;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  });

  useEffect(() => {
    if (!request || handledRef.current === request.id) return;
    handledRef.current = request.id;
    const current = currentView();
    const latest = configRef.current;
    let next: View;
    switch (request.kind) {
      case 'preset':
        next = presetView(request.preset, latest);
        break;
      case 'frame': {
        const box = partBounds(scene, request.part ?? 'size', latest);
        next = frameView(current, { min: toVec(box.min), max: toVec(box.max) }, camera.fov, size.width / Math.max(size.height, 1), limits);
        break;
      }
      case 'axis':
        next = axisView(current, request.direction);
        break;
      case 'orbit':
        next = orbitView(current, request.azimuth * ORBIT_STEP, request.polar * ORBIT_STEP);
        break;
      case 'opposite':
        next = oppositeView(current);
        break;
      case 'zoom':
        next = zoomView(current, request.factor, limits, houseBox(latest));
        break;
      default:
        return;
    }
    moveTo(next);
  }, [request, camera, scene, size, limits, currentView, moveTo]);

  useFrame((_, delta) => {
    const transition = transitionRef.current;
    if (!transition) return;
    transition.elapsed += Math.min(delta, 0.1);
    const t = Math.min(transition.elapsed / transition.duration, 1);
    apply(interpolateView(transition.from, transition.to, easeInOutCubic(t)));
    if (t >= 1) transitionRef.current = null;
    invalidate();
  });

  return null;
}
