/**
 * Camera math for the 3D view, kept free of three.js so it can be unit tested: eased transitions
 * that swing around the target instead of cutting through the model, framing a box, stepping the
 * orbit like Blender's numpad, the orientation gizmo, and where each named view puts the camera.
 */

import type { FarmConfig } from '@/types/farm';
import { anteroom, buildCageRows, entryDepth } from '@/components/farm/scene/shedLayout';

export type Vec3 = [number, number, number];

export interface View {
  position: Vec3;
  target: Vec3;
}

export interface Spherical {
  radius: number;
  /** Angle down from straight up (radians). */
  polar: number;
  /** Angle around the vertical axis, 0 looking from +Z (radians). */
  azimuth: number;
}

const EPSILON = 1e-6;
/** The orbit never quite reaches the poles, so the up vector stays defined. */
export const MIN_POLAR = 0.02;
export const MAX_POLAR = Math.PI / 2 - 0.05;

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const length3 = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

export function toSpherical(offset: Vec3): Spherical {
  const radius = length3(offset);
  if (radius < EPSILON) return { radius: 0, polar: Math.PI / 2, azimuth: 0 };
  return {
    radius,
    polar: Math.acos(clamp(offset[1] / radius, -1, 1)),
    azimuth: Math.atan2(offset[0], offset[2]),
  };
}

export function fromSpherical({ radius, polar, azimuth }: Spherical): Vec3 {
  const ring = radius * Math.sin(polar);
  return [ring * Math.sin(azimuth), radius * Math.cos(polar), ring * Math.cos(azimuth)];
}

/** The signed smallest turn from one angle to another, in (-PI, PI]. */
export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * The camera part-way through a move between two views. The target slides straight across while
 * the camera swings around it on the shortest arc, with the distance eased on a log scale so a
 * zoom feels even.
 */
export function interpolateView(from: View, to: View, t: number): View {
  const target: Vec3 = [
    lerp(from.target[0], to.target[0], t),
    lerp(from.target[1], to.target[1], t),
    lerp(from.target[2], to.target[2], t),
  ];
  const a = toSpherical(sub(from.position, from.target));
  const b = toSpherical(sub(to.position, to.target));
  const radius =
    a.radius > EPSILON && b.radius > EPSILON ? Math.exp(lerp(Math.log(a.radius), Math.log(b.radius), t)) : lerp(a.radius, b.radius, t);
  // Seen from straight above or below the azimuth is meaningless; take the other end's.
  const azimuthA = Math.sin(a.polar) < 0.01 ? b.azimuth : a.azimuth;
  const azimuthB = Math.sin(b.polar) < 0.01 ? azimuthA : b.azimuth;
  const offset = fromSpherical({
    radius,
    polar: lerp(a.polar, b.polar, t),
    azimuth: azimuthA + shortestAngle(azimuthA, azimuthB) * t,
  });
  return { position: add(target, offset), target };
}

/** How long a move should take: longer for bigger swings, never sluggish. Zero for reduced motion. */
export function transitionDuration(from: View, to: View, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const a = toSpherical(sub(from.position, from.target));
  const b = toSpherical(sub(to.position, to.target));
  const turn = Math.abs(shortestAngle(a.azimuth, b.azimuth)) + Math.abs(a.polar - b.polar);
  const zoom = a.radius > EPSILON && b.radius > EPSILON ? Math.abs(Math.log(b.radius / a.radius)) : 1;
  const travel = length3(sub(to.target, from.target)) / Math.max(a.radius, b.radius, 1);
  return clamp(0.42 + turn * 0.18 + zoom * 0.25 + travel * 0.3, 0.42, 1.1);
}

/** The distance at which a sphere of this radius fills the view, with some margin. */
export function frameDistance(radius: number, verticalFovDeg: number, aspect: number, margin = 1.25): number {
  const vertical = (verticalFovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, EPSILON));
  const fov = Math.min(vertical, horizontal);
  return (Math.max(radius, 0.5) * margin) / Math.sin(fov / 2);
}

/** A view of a box from the current viewing direction, close enough to fill the screen. */
export function frameView(
  current: View,
  box: { min: Vec3; max: Vec3 },
  verticalFovDeg: number,
  aspect: number,
  limits: { minDistance: number; maxDistance: number } = { minDistance: 2, maxDistance: 200 }
): View {
  const centre: Vec3 = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  const radius = length3(sub(box.max, box.min)) / 2;
  const distance = clamp(frameDistance(radius, verticalFovDeg, aspect), limits.minDistance, limits.maxDistance);
  const direction = toSpherical(sub(current.position, current.target));
  const offset = fromSpherical({
    radius: distance,
    polar: clamp(direction.polar, 0.25, MAX_POLAR),
    azimuth: direction.azimuth,
  });
  return { position: add(centre, offset), target: centre };
}

/** Turns the camera around its target by the given angles (radians), like Blender's numpad 2/4/6/8. */
export function orbitView(current: View, azimuthDelta: number, polarDelta: number): View {
  const offset = toSpherical(sub(current.position, current.target));
  const next = fromSpherical({
    radius: offset.radius,
    polar: clamp(offset.polar + polarDelta, MIN_POLAR, MAX_POLAR),
    azimuth: offset.azimuth + azimuthDelta,
  });
  return { position: add(current.target, next), target: current.target };
}

/** The view from the other side (Blender's Ctrl+numpad): half a turn around the target. */
export function oppositeView(current: View): View {
  return orbitView(current, Math.PI, 0);
}

/** A view looking along an axis at the target, keeping the current distance. */
export function axisView(current: View, direction: Vec3): View {
  const distance = Math.max(length3(sub(current.position, current.target)), 2);
  const unit = length3(direction) > EPSILON ? direction : ([0, 0, 1] as Vec3);
  const offset = toSpherical(unit);
  const next = fromSpherical({ radius: distance, polar: clamp(offset.polar, MIN_POLAR, MAX_POLAR), azimuth: offset.azimuth });
  return { position: add(current.target, next), target: current.target };
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

const inside = (point: Vec3, box: Box3) => point.every((value, i) => value > box.min[i] && value < box.max[i]);

/** How far along the segment from `a` to `b` (0..1) it first enters the box, or null if it never does. */
export function segmentEntry(a: Vec3, b: Vec3, box: Box3): number | null {
  let enter = 0;
  let exit = 1;
  for (let i = 0; i < 3; i += 1) {
    const d = b[i] - a[i];
    if (Math.abs(d) < EPSILON) {
      if (a[i] <= box.min[i] || a[i] >= box.max[i]) return null;
      continue;
    }
    const t0 = (box.min[i] - a[i]) / d;
    const t1 = (box.max[i] - a[i]) / d;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (enter > exit) return null;
  }
  return enter;
}

/**
 * Moves the camera towards (factor < 1) or away from the target. With `keepOut` (the shed), a
 * zoom in from outside towards a target that is also outside stops short of the cover instead of
 * passing through it; a target inside the shed can still be zoomed into.
 */
export function zoomView(current: View, factor: number, limits = { minDistance: 2, maxDistance: 220 }, keepOut?: Box3): View {
  const offset = toSpherical(sub(current.position, current.target));
  let radius = clamp(offset.radius * factor, limits.minDistance, limits.maxDistance);
  if (keepOut && radius < offset.radius && !inside(current.position, keepOut) && !inside(current.target, keepOut)) {
    const moved = add(current.target, fromSpherical({ ...offset, radius }));
    const entry = segmentEntry(current.position, moved, keepOut);
    if (entry !== null) {
      // Stop half a metre before the cover, but never move backwards.
      radius = offset.radius - Math.max(0, entry * (offset.radius - radius) - 0.5);
    }
  }
  const next = fromSpherical({ ...offset, radius });
  return { position: add(current.target, next), target: current.target };
}

export type GizmoAxis = 'x' | 'y' | 'z' | '-x' | '-y' | '-z';

export const GIZMO_AXES: Array<{ axis: GizmoAxis; direction: Vec3 }> = [
  { axis: 'x', direction: [1, 0, 0] },
  { axis: 'y', direction: [0, 1, 0] },
  { axis: 'z', direction: [0, 0, 1] },
  { axis: '-x', direction: [-1, 0, 0] },
  { axis: '-y', direction: [0, -1, 0] },
  { axis: '-z', direction: [0, 0, -1] },
];

/**
 * Where each world axis points on screen for a camera with this world-to-camera rotation (the
 * upper 3x3 of the view matrix, column-major as three.js stores it). x right, y up, depth > 0
 * towards the viewer. Sorted back to front so the nearest axis is drawn last.
 */
export function projectAxes(viewRotation: ArrayLike<number>): Array<{ axis: GizmoAxis; x: number; y: number; depth: number }> {
  const e = viewRotation;
  return GIZMO_AXES.map(({ axis, direction: [dx, dy, dz] }) => ({
    axis,
    x: e[0] * dx + e[4] * dy + e[8] * dz,
    y: e[1] * dx + e[5] * dy + e[9] * dz,
    depth: e[2] * dx + e[6] * dy + e[10] * dz,
  })).sort((a, b) => a.depth - b.depth);
}

export type CameraPreset =
  | 'auto'
  | 'overview'
  | 'front'
  | 'back'
  | 'side'
  | 'other-side'
  | 'top'
  | 'inside'
  | 'focus-entry'
  | 'focus-walls'
  | 'focus-feeding'
  | 'focus-fans';

export type HouseShape = Pick<FarmConfig, 'length' | 'width' | 'eavesHeight' | 'ridgeHeight' | 'housingSystem' | 'entry'> &
  Partial<Pick<FarmConfig, 'birdType' | 'cageTiers'>>;

/**
 * Where to stand across the width to look down the shed: off the centre line on the floor, and in an aisle between
 * (or beside) the cage rows of a layer shed, so the camera is never inside a cage.
 */
function aisleX({ width, length, birdType, cageTiers }: HouseShape, fallback: number): number {
  if (birdType !== 'layer-cage') return fallback;
  const rows = buildCageRows(width, length, cageTiers ?? 3);
  const edge = (i: number) => rows[i].x + rows[i].halfWidth;
  if (rows.length > 1) return (edge(0) + rows[1].x - rows[1].halfWidth) / 2;
  // One row: the aisle beside it, kept inside the walls of a shed too narrow for one.
  return Math.min((edge(0) + width / 2) / 2, width / 2 - 0.15);
}

/** Eye height of someone standing beside the shed. */
const EYE = 1.7;

/** Below this length a view down the shed would be closer than the orbit allows (2 m). */
const SHORT_SHED = 6;

/** From near the entry corner to the far corner of the floor: the inside views of a short shed. */
function acrossInside(halfWidth: number, halfLength: number, y: number, targetY: number): View {
  return { position: [halfWidth * 0.8, y, halfLength * 0.8], target: [-halfWidth * 0.8, targetY, -halfLength * 0.8] };
}

/** The shed as a box (footprint up to the ridge), for keeping a zoom from passing through the walls and roof. */
export function houseBox({ length, width, ridgeHeight }: HouseShape): Box3 {
  return { min: [-width / 2, 0, -length / 2], max: [width / 2, ridgeHeight, length / 2] };
}

/**
 * The opening view: from a front corner and above, so the entry, one open side and the birds inside all show. A
 * long, narrow shed is seen more from its side. A controlled shed is seen from the other corner, past the pads.
 */
function overview({ length, width, ridgeHeight, housingSystem }: HouseShape): View {
  const reach = Math.max(length, width * 2, 6);
  const side = housingSystem === 'environment-controlled' ? -1 : 1;
  return {
    position: [side * (width * 0.9 + reach * 0.45), ridgeHeight * 1.6 + reach * 0.3, length * 0.5 + reach * 0.45],
    target: [0, ridgeHeight * 0.3, 0],
  };
}

/**
 * Where the camera goes for each named view. Coordinates follow the scene: x across the width, z
 * along the length with the entry end wall at +z, y up, the shed centred on the origin. The focus
 * views stand outside the shed (or, for feeding, low inside) so nothing blocks the part.
 */
export function presetView(preset: CameraPreset, house: HouseShape): View {
  const { length, width, ridgeHeight, eavesHeight } = house;
  const maxSpan = Math.max(length, width);
  const halfWidth = width / 2;
  const halfLength = length / 2;
  switch (preset) {
    case 'auto':
    case 'overview':
      return overview(house);
    case 'front':
      return { position: [0, ridgeHeight * 1.5, length * 2.0], target: [0, ridgeHeight * 0.45, 0] };
    case 'back':
      return { position: [0, ridgeHeight * 1.5, -length * 2.0], target: [0, ridgeHeight * 0.45, 0] };
    case 'side':
      return { position: [width * 2.0 + length * 0.6, ridgeHeight * 1.35, 0], target: [0, ridgeHeight * 0.45, 0] };
    case 'other-side':
      return { position: [-(width * 2.0 + length * 0.6), ridgeHeight * 1.35, 0], target: [0, ridgeHeight * 0.45, 0] };
    case 'top':
      return { position: [0.01, ridgeHeight + maxSpan * 2.4, 0.01], target: [0, ridgeHeight * 0.2, 0] };
    // Standing just inside the entry, under the eaves, looking down the shed. Both points stay
    // inside the footprint whatever the size, and at least 2 m apart (the orbit's minimum).
    case 'inside': {
      const y = Math.min(eavesHeight - 0.35, Math.max(1.5, eavesHeight * 0.45));
      // A shed too short to look down: corner to corner, the longest line inside it.
      if (length < SHORT_SHED) return acrossInside(halfWidth, halfLength, y, Math.max(1, y - 0.5));
      const z = halfLength - clamp(length * 0.12, 0.8, 4);
      // Off the centre line, where the feeder lines and cage rows often run.
      const x = aisleX(house, Math.min(0.6, halfWidth * 0.2));
      return {
        position: [x, y, z],
        target: [x, Math.max(1, y - 0.5), Math.min(z - 2, -halfLength * 0.6)],
      };
    }
    // Outside in front of the entry at eye height, a little to one side so the depth of the
    // anteroom reads, and far enough back that the whole anteroom, footbath and door are in view.
    case 'focus-entry': {
      const room = anteroom(house.entry, eavesHeight);
      const depth = entryDepth(house.entry);
      const height = room?.height ?? Math.min(2.2, eavesHeight);
      const back = clamp(5.5 + eavesHeight * 0.35 + width * 0.02, 6.5, 11);
      return {
        position: [back * 0.3, EYE, halfLength + depth + back],
        target: [0, height * 0.5, halfLength + depth * 0.5],
      };
    }
    // A few bays of the long side wall, from outside and at an angle, ending at the front end
    // where the curtain winch is mounted.
    case 'focus-walls': {
      const stretch = Math.min(length, 14);
      const back = clamp(stretch * 0.9 + eavesHeight * 0.5, 6, 16);
      const angle = 0.7;
      const target: Vec3 = [halfWidth + 0.1, eavesHeight * 0.5, halfLength - stretch * 0.5];
      return {
        position: [target[0] + back * Math.cos(angle), Math.max(EYE, eavesHeight * 0.75), target[2] + back * Math.sin(angle)],
        target,
      };
    }
    // Low inside, looking along the feeder and drinker lines (or the cage aisle) toward the back wall.
    case 'focus-feeding': {
      const y = Math.max(1.1, eavesHeight * 0.3);
      const low = Math.max(0.7, eavesHeight * 0.18);
      if (length < SHORT_SHED) return acrossInside(halfWidth, halfLength, y, low);
      const x = aisleX(house, -halfWidth * 0.18);
      return {
        position: [x, y, halfLength * 0.05],
        target: [house.birdType === 'layer-cage' ? x : -halfWidth * 0.34, low, -halfLength * 0.85],
      };
    }
    // The tunnel fans fill the back end wall; seen from outside behind it, at an angle. A wide shed shows
    // its first 16 m.
    case 'focus-fans': {
      const stretch = Math.min(width, 16);
      const fanTop = Math.min(1.63, eavesHeight - 0.1);
      const back = clamp(stretch * 0.9 + 2, 7, 18);
      const angle = 0.5;
      const target: Vec3 = [-halfWidth + stretch * 0.5, fanTop / 2, -halfLength - 0.1];
      return {
        position: [target[0] - back * Math.sin(angle), Math.max(EYE + 0.3, eavesHeight * 0.6), target[2] - back * Math.cos(angle)],
        target,
      };
    }
    default:
      return overview(house);
  }
}
