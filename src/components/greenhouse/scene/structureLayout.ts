import type { DoorEntry, GreenhouseType, RoofType } from '@/types/greenhouse';

/**
 * Where every structural member of the building goes. Pure and deterministic, so the frame, the
 * covers, the vents and the door all agree on the same grid, and the rules are unit-tested.
 *
 * The grid follows Indian NHB-style polyhouses (docs/3d-model-references.md): the width is split into
 * spans close to 8 m (a wide house is multi-span with gutters between spans, not one huge arch) and
 * the length into bays close to 4 m. A flat shade-net house uses posts about 5 m apart instead.
 * Coordinates: x across the width, z along the length, y up; the house is centred on the origin, and
 * the front (door) end wall is at +z.
 */

export type Point2 = readonly [number, number];

export const SPAN_TARGET = 8;
export const BAY_TARGET = 4;
const NET_POST_TARGET = 5;
/** Height of the ridge (top) vent opening of a naturally ventilated house, at most. */
const VENT_MAX = 0.9;
/** How far the high half of a vented arch reaches past the ridge, so rain cannot enter the vent. */
export const VENT_OVERHANG = 0.45;

export interface StructureInput {
  length: number;
  width: number;
  gutterHeight: number;
  ridgeHeight: number;
  roofType: RoofType;
  greenhouseType: GreenhouseType;
}

export interface StructureLayout {
  length: number;
  width: number;
  halfLength: number;
  halfWidth: number;
  gutterHeight: number;
  roofType: RoofType;
  /** Height of the roof above the gutter; 0 for a flat roof. */
  rise: number;
  spans: number;
  spanWidth: number;
  /** x of the middle of every span. */
  spanCentres: number[];
  /** x of every gutter line (columns stand on these), spans + 1 of them. */
  gutterX: number[];
  bays: number;
  bayLength: number;
  /** z of every frame line (an arch and a row of columns), bays + 1 of them. */
  frameZ: number[];
  /** True for a naturally ventilated house with a pitched roof: every span has a ridge vent. */
  topVent: boolean;
  /** Height of the ridge vent opening (0 without one). */
  ventHeight: number;
  /** True for the flat cable-and-post shade-net house. */
  tensile: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Number of equal parts close to `target` long; at least one. */
export function divide(total: number, target: number): number {
  return Math.max(1, Math.round(total / target));
}

export function buildStructureLayout(input: StructureInput): StructureLayout {
  const length = Math.max(1, input.length);
  const width = Math.max(1, input.width);
  const gutterHeight = Math.max(1, input.gutterHeight);
  const flat = input.roofType === 'flat';
  const rise = flat ? 0 : Math.max(0.3, input.ridgeHeight - gutterHeight);
  const tensile = input.greenhouseType === 'shade-net' && flat;

  const spans = divide(width, tensile ? NET_POST_TARGET : SPAN_TARGET);
  const spanWidth = width / spans;
  const bays = divide(length, tensile ? NET_POST_TARGET : BAY_TARGET);
  const bayLength = length / bays;
  const halfWidth = width / 2;
  const halfLength = length / 2;

  const topVent = input.greenhouseType === 'naturally-ventilated' && !flat && rise >= 0.6;
  return {
    length,
    width,
    halfLength,
    halfWidth,
    gutterHeight,
    roofType: input.roofType,
    rise,
    spans,
    spanWidth,
    spanCentres: Array.from({ length: spans }, (_, i) => -halfWidth + spanWidth * (i + 0.5)),
    gutterX: Array.from({ length: spans + 1 }, (_, i) => -halfWidth + spanWidth * i),
    bays,
    bayLength,
    frameZ: Array.from({ length: bays + 1 }, (_, i) => -halfLength + bayLength * i),
    topVent,
    ventHeight: topVent ? Math.min(VENT_MAX, rise * 0.35) : 0,
    tensile,
  };
}

/**
 * Height of the roof above the gutter at `x` across one span (x = 0 is the span middle), for the full
 * (unvented) arch. Gothic is a pointed arch of two circular arcs that spring vertically from the
 * gutters and meet at the ridge; gable is two straight rafters.
 */
export function roofY(roofType: RoofType, halfSpan: number, rise: number, x: number): number {
  const u = clamp(Math.abs(x), 0, halfSpan);
  if (roofType === 'flat' || rise <= 0) return 0;
  if (roofType === 'gable') return rise * (1 - u / halfSpan);
  // Circle through (-halfSpan, 0) and (0, rise) with its centre on the springing line.
  const c = (rise * rise - halfSpan * halfSpan) / (2 * halfSpan);
  const r = c + halfSpan;
  const dx = -u - c;
  return Math.sqrt(Math.max(0, r * r - dx * dx));
}

/** Points along one half of the arch, from the gutter (x = ±halfSpan) to the middle (x = 0). */
function halfArch(roofType: RoofType, halfSpan: number, rise: number, side: -1 | 1, segments: number, scaleY = 1): Point2[] {
  const count = roofType === 'gothic' ? Math.max(2, segments) : 1;
  return Array.from({ length: count + 1 }, (_, i) => {
    // Gothic arches bend most near the gutter, so the samples are packed there.
    const t = roofType === 'gothic' ? 1 - Math.cos(((i / count) * Math.PI) / 2) : i / count;
    const x = side * halfSpan * (1 - t);
    return [x, roofY(roofType, halfSpan, rise, x) * scaleY] as const;
  });
}

export interface SpanProfile {
  /** The arch over one span, as one or two polylines (two when the ridge is vented). */
  arches: Point2[][];
  /** The ridge vent opening (x and the low/high y), when there is one. */
  vent: { x: number; low: number; high: number } | null;
}

/**
 * The roof line over one span, relative to the span middle and the gutter. With a ridge vent, the
 * left half rises to the full ridge and overhangs the opening; the right half stops one vent height
 * lower, and the gap between them is the insect-netted vent.
 */
export function spanProfile(layout: StructureLayout, segments: number): SpanProfile {
  const halfSpan = layout.spanWidth / 2;
  const { roofType, rise } = layout;
  if (roofType === 'flat' || rise <= 0) return { arches: [[[-halfSpan, 0], [halfSpan, 0]]], vent: null };

  const left = halfArch(roofType, halfSpan, rise, -1, segments);
  const right = halfArch(roofType, halfSpan, rise, 1, segments).reverse();
  if (!layout.topVent) return { arches: [[...left, ...right.slice(1)]], vent: null };

  const low = rise - layout.ventHeight;
  const slope = roofType === 'gable' ? rise / halfSpan : 0.35;
  const overhang = Math.min(VENT_OVERHANG, halfSpan * 0.2);
  const highHalf: Point2[] = [...left, [overhang, rise - overhang * slope]];
  const lowHalf = halfArch(roofType, halfSpan, rise, 1, segments, low / rise).reverse();
  return { arches: [highHalf, lowHalf], vent: { x: 0, low, high: rise } };
}

/** The full arch over one span with no vent: what the end walls follow. */
export function fullArch(layout: StructureLayout, segments: number): Point2[] {
  return spanProfile({ ...layout, topVent: false, ventHeight: 0 }, segments).arches[0];
}

/** Arch samples per half for each quality level. */
export function archSegments(quality: 'high' | 'balanced' | 'lite'): number {
  return quality === 'high' ? 9 : quality === 'balanced' ? 7 : 4;
}

/** The roll-up curtain or louvre band in the side walls: from the apron to below the gutter. */
export function sideOpening(gutterHeight: number): { bottom: number; top: number } {
  const bottom = clamp(gutterHeight * 0.12, 0.3, 0.6);
  const top = Math.max(bottom + 0.8, gutterHeight - clamp(gutterHeight * 0.16, 0.4, 0.9));
  return { bottom, top: Math.min(top, gutterHeight - 0.15) };
}

/** Clear opening of each door type, metres. */
export const DOOR_OPENING: Record<DoorEntry, { width: number; height: number }> = {
  'single-sliding': { width: 1.2, height: 2.1 },
  'double-sliding': { width: 1.8, height: 2.2 },
  'roll-up': { width: 1.8, height: 2.2 },
  curtain: { width: 1.5, height: 2.1 },
};

export interface Antechamber {
  width: number;
  depth: number;
  height: number;
}

/**
 * The double-door entry room in front of the end wall. Polyhouses keep one so insects do not follow
 * people in; the open shade-net house does not. It never rises above the gutter.
 */
export function antechamber(type: GreenhouseType, door: DoorEntry, gutterHeight: number): Antechamber | null {
  if (type === 'shade-net') return null;
  const opening = DOOR_OPENING[door];
  const height = Math.min(Math.max(opening.height + 0.35, 2.4), gutterHeight - 0.1);
  if (height < opening.height + 0.1) return null;
  return { width: Math.max(2.2, opening.width + 0.6), depth: 2, height };
}

/**
 * x centres of the exhaust fans in the front end wall, kept clear of the entry and the corners.
 * Returns an empty list when the wall is too narrow for even one fan beside the door.
 */
export function fanPositions(halfWidth: number, entryHalf: number, fanSize: number, max = 12): number[] {
  const pitch = fanSize + 0.25;
  const first = entryHalf + 0.35 + fanSize / 2;
  const last = halfWidth - 0.35 - fanSize / 2;
  if (last < first) return [];
  const perSide = Math.min(max, Math.floor((last - first) / pitch) + 1);
  const xs: number[] = [];
  for (let i = 0; i < perSide; i += 1) xs.push(-(first + i * pitch), first + i * pitch);
  return xs.sort((a, b) => a - b);
}

/** Positions from..to about `spacing` apart, both ends included, never more than `max`. */
export function spaced(from: number, to: number, spacing: number, max: number): number[] {
  const count = clamp(Math.round((to - from) / spacing) + 1, 2, Math.max(2, max));
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
}
