import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/** Longest frame step an animation takes, so a stalled tab does not jump straight to the end. */
export const MAX_STEP = 0.2;

export interface Size3 {
  width: number;
  length: number;
  height: number;
}

/** A size change that arrives sooner than this after the previous one is a live drag: no easing. */
const DRAG_INTERVAL_MS = 90;
/** Damping rate: about 95 % of the way in 170 ms. */
const SIZE_LAMBDA = 18;

/**
 * Eases a model to a new size by briefly scaling its root from the old size to the new one. The
 * geometry itself is rebuilt once at the new size, so the ease costs nothing per frame.
 */
export function useSizeEase(ref: RefObject<THREE.Object3D>, size: Size3) {
  const invalidate = useThree((state) => state.invalidate);
  const reduced = usePrefersReducedMotion();
  const previous = useRef(size);
  const lastChange = useRef(0);
  const active = useRef(false);

  const { width, length, height } = size;

  useLayoutEffect(() => {
    const object = ref.current;
    const before = previous.current;
    const next = { width, length, height };
    previous.current = next;
    if (!object) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dragging = now - lastChange.current < DRAG_INTERVAL_MS;
    lastChange.current = now;
    if (reduced || dragging || before.width <= 0 || before.length <= 0 || before.height <= 0) {
      object.scale.set(1, 1, 1);
      active.current = false;
      return;
    }
    // Start where the eye last saw the model, including part-way through a previous ease.
    object.scale.set(
      (object.scale.x * before.width) / next.width,
      (object.scale.y * before.height) / next.height,
      (object.scale.z * before.length) / next.length
    );
    active.current = true;
    invalidate();
  }, [ref, width, length, height, reduced, invalidate]);

  useFrame((_, delta) => {
    const object = ref.current;
    if (!active.current || !object) return;
    const step = Math.min(delta, MAX_STEP);
    const s = object.scale;
    s.set(
      THREE.MathUtils.damp(s.x, 1, SIZE_LAMBDA, step),
      THREE.MathUtils.damp(s.y, 1, SIZE_LAMBDA, step),
      THREE.MathUtils.damp(s.z, 1, SIZE_LAMBDA, step)
    );
    if (Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) < 0.003) {
      s.set(1, 1, 1);
      active.current = false;
    } else {
      invalidate();
    }
  });
}
