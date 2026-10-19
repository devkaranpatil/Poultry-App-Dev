import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Smooth changes for the 3D model, all driven from useFrame so they also run with
 * frameloop="demand" (every animating frame asks for the next one with invalidate()).
 *
 *  Reveal   a part grows out of the ground, rises into place, or fades in when it mounts
 *  Swap     when the option it shows changes, the old part animates out while the new one animates in
 *  useSizeEase  the whole model eases to a new size, unless sizes arrive every frame (a live drag)
 *
 * With prefers-reduced-motion everything snaps.
 */

export type RevealKind = 'grow' | 'rise' | 'fade';

/** Name prefix given to every object of an outgoing part, so lookups by name only find the live one. */
export const LEAVING_PREFIX = 'leaving:';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Longest frame step an animation takes, so a stalled tab does not jump straight to the end. */
const MAX_STEP = 0.2;

interface FadeTarget {
  material: THREE.Material;
  base: number;
}

/** Transparent materials in a subtree with their resting opacity. Opaque ones only scale. */
function collectFades(root: THREE.Object3D): FadeTarget[] {
  const seen = new Set<THREE.Material>();
  const targets: FadeTarget[] = [];
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      if (!m.transparent || seen.has(m)) continue;
      seen.add(m);
      targets.push({ material: m, base: (m.userData.restOpacity as number | undefined) ?? m.opacity });
      m.userData.restOpacity = (m.userData.restOpacity as number | undefined) ?? m.opacity;
    }
  });
  return targets;
}

/** Puts a group at transition progress p (0 hidden, 1 in place). */
export function applyReveal(group: THREE.Object3D, kind: RevealKind, p: number, fades: FadeTarget[] | null) {
  const e = easeOutCubic(p);
  if (kind === 'grow') {
    group.scale.set(1, Math.max(0.001, e), 1);
  } else if (kind === 'rise') {
    const s = 0.9 + 0.1 * e;
    group.scale.set(s, s, s);
    group.position.y = (1 - e) * -0.5;
  } else {
    const s = 1 + (1 - e) * 0.025;
    group.scale.set(s, s, s);
  }
  if (fades) for (const f of fades) f.material.opacity = f.base * e;
  group.visible = p > 0.001;
}

interface RevealProps {
  kind?: RevealKind;
  /** Seconds before the part starts to appear (for staggering). */
  delay?: number;
  /** Seconds the transition takes. */
  duration?: number;
  /** When true the part animates out, then calls onLeft. */
  leaving?: boolean;
  onLeft?: () => void;
  name?: string;
  children: ReactNode;
}

/** A group that animates in when it mounts, and out when `leaving` turns true. */
export function Reveal({ kind = 'rise', delay = 0, duration = 0.38, leaving = false, onLeft, name, children }: RevealProps) {
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = usePrefersReducedMotion();
  const state = useRef({ t: reduced ? 1 : 0, wait: delay, done: reduced, fades: null as FadeTarget[] | null });
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;

  // Hide before the first frame is drawn, so nothing pops in at full size.
  useLayoutEffect(() => {
    const group = ref.current;
    if (!group || state.current.done) return;
    if (kind !== 'grow') state.current.fades = collectFades(group);
    applyReveal(group, kind, 0, state.current.fades);
    invalidate();
    // Runs once, on mount: later changes of kind or delay do not restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const group = ref.current;
    if (!leaving || !group) return;
    // Outgoing objects lose their names, so tests and click handling see only the incoming part.
    group.traverse((object) => {
      if (object.name && !object.name.startsWith(LEAVING_PREFIX)) object.name = `${LEAVING_PREFIX}${object.name}`;
    });
    const s = state.current;
    s.wait = 0;
    s.done = false;
    if (kind !== 'grow') s.fades = collectFades(group);
    if (reduced) {
      onLeftRef.current?.();
      return;
    }
    invalidate();
    // A fallback in case frames stop (hidden tab): the part is removed anyway.
    const timer = window.setTimeout(() => onLeftRef.current?.(), (duration + 0.6) * 1000);
    return () => window.clearTimeout(timer);
  }, [leaving, kind, duration, reduced, invalidate]);

  useFrame((_, delta) => {
    const s = state.current;
    const group = ref.current;
    if (s.done || !group) return;
    const step = Math.min(delta, MAX_STEP);
    if (s.wait > 0) {
      s.wait -= step;
      invalidate();
      return;
    }
    s.t = THREE.MathUtils.clamp(s.t + (leaving ? -step : step) / duration, 0, 1);
    applyReveal(group, kind, s.t, s.fades);
    const finished = leaving ? s.t <= 0 : s.t >= 1;
    if (!finished) {
      invalidate();
      return;
    }
    s.done = true;
    if (leaving) {
      onLeftRef.current?.();
    } else {
      // At rest: full opacity back, and new materials created later are left alone.
      if (s.fades) for (const f of s.fades) f.material.opacity = f.base;
      s.fades = null;
    }
  });

  return (
    <group ref={ref} name={name}>
      {children}
    </group>
  );
}

interface SwapProps {
  /** What is shown; a new id cross-fades from the old part to the new. null shows nothing. */
  id: string | null;
  kind?: RevealKind;
  delay?: number;
  duration?: number;
  children?: ReactNode;
}

interface SwapStore {
  id: string | null;
  key: string;
  seq: number;
  node: ReactNode;
  leaving: Map<string, ReactNode>;
}

/**
 * Shows `children` for the current id. When the id changes, the previous children stay mounted (with
 * their old props) while they animate out, and the new children animate in. Children updated under
 * the same id (a new size, say) update in place with no transition.
 */
export function Swap({ id, kind = 'rise', delay = 0, duration = 0.36, children }: SwapProps) {
  const store = useRef<SwapStore | null>(null);
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);
  if (!store.current) store.current = { id, key: `${id}#0`, seq: 0, node: children, leaving: new Map() };
  const s = store.current;
  // Derived during render and guarded by the id comparison, so a repeated render is a no-op.
  if (id !== s.id) {
    if (s.id !== null && s.node != null) s.leaving.set(s.key, s.node);
    s.seq += 1;
    s.id = id;
    s.key = `${id}#${s.seq}`;
  }
  s.node = children;

  const items: { key: string; node: ReactNode; leaving: boolean }[] = [...s.leaving].map(([key, node]) => ({ key, node, leaving: true }));
  if (id !== null && children != null) items.push({ key: s.key, node: children, leaving: false });

  return (
    <>
      {items.map((item) => (
        <Reveal
          key={item.key}
          kind={kind}
          delay={item.leaving ? 0 : delay}
          duration={duration}
          leaving={item.leaving}
          onLeft={() => {
            if (s.leaving.delete(item.key)) forceUpdate();
          }}
        >
          {item.node}
        </Reveal>
      ))}
    </>
  );
}

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
