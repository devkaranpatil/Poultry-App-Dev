import type { BirdType, FeedingSystem, ShedEntry, ShedRoof } from '@/types/farm';

/**
 * Where everything in the shed goes, worked out once from the setup and kept free of three.js so it can be unit
 * tested: the truss bays, the roof planes and the line the roof follows over the walls, the entry, and inside, the
 * cage rows, the feeders and drinkers and the birds. The models in ShedStructure.tsx and ShedInterior.tsx only draw
 * what this says. Sizes follow docs/3d-model-references.md.
 *
 * Coordinates: x across the width, z along the length with the entry at +z, y up, the shed centred on the origin.
 */

export type RenderQuality = 'high' | 'balanced' | 'lite';
export type Point2 = readonly [number, number];

/** Trusses about every 3 m (10 ft), as in small Indian sheds. */
export const BAY_TARGET = 3;
/** Roof overhang past the side walls: at least 3.5 ft (IS 2732, TNAU). */
export const OVERHANG = 1.07;
/** The roof runs a little past the end walls. */
export const END_OVERHANG = 0.45;
/** The concrete plinth: its top above the ground, and how far the floor runs outside the walls (1.5 ft). */
export const PLINTH = 0.12;
export const PLINTH_APRON = 0.45;
/** The brick wall under the mesh: 1 to 1.5 ft. */
export const LOW_WALL = 0.45;
/** The monitor roof: the open band at the ridge as a share of the width, and how far its cap overlaps the opening. */
export const MONITOR_SHARE = 0.2;
export const MONITOR_OVERLAP = 0.3;
/** The shed door. */
export const ENTRY_OPENING = { width: 1.1, height: 2.0 } as const;
/** The anteroom in front of the door. */
export const ANTEROOM = { width: 2.2, depth: 1.8, height: 2.4 } as const;
/** The footbath outside the door. */
export const FOOTBATH = { width: 1.2, depth: 0.9 } as const;
/** The most birds drawn at each quality; the rest of the flock is implied. */
export const BIRD_CAP: Record<RenderQuality, number> = { high: 1200, balanced: 600, lite: 200 };
/** The most feeders, drinkers, pans or nipples drawn of each kind. */
export const FITTING_CAP: Record<RenderQuality, number> = { high: 900, balanced: 500, lite: 160 };

export interface ShedShape {
  length: number;
  width: number;
  eavesHeight: number;
  ridgeHeight: number;
  roofType: ShedRoof;
}

/** One strip of roof sheet in cross-section, from `a` to `b`; it runs the whole length plus the end overhangs. */
export interface RoofPlane {
  a: Point2;
  b: Point2;
}

export interface ShedLayout {
  halfWidth: number;
  halfLength: number;
  eavesHeight: number;
  ridgeHeight: number;
  roofType: ShedRoof;
  bays: number;
  bayLength: number;
  /** The truss lines along the length, both end walls included. */
  frameZ: number[];
  /** The roof's sheets. */
  planes: RoofPlane[];
  /** The line the roof follows over the walls, from the left wall (-x) to the right wall (+x): the end-wall gable and the truss top. */
  profile: Point2[];
  /** How high the walls reach on the left (-x) and right (+x); a lean-to is taller on the right. */
  wallTop: { left: number; right: number };
  /** The monitor's open band (half its width) and how far its cap is raised; null for other roofs. */
  monitor: { halfWidth: number; lift: number } | null;
  /** The roof's extent along the length. */
  roofZ: { min: number; max: number };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** How far a monitor roof's cap is lifted over the lower roof: a third of the rise, between 25 and 50 cm. */
export function monitorLift(rise: number): number {
  return clamp(rise * 0.35, 0.25, 0.5);
}

/** The height of the roof's top line at x (inside the walls). For a monitor, the lower roof outside the open band. */
export function roofHeightAt(shape: ShedShape, x: number): number {
  const halfWidth = Math.max(shape.width, 0.5) / 2;
  const rise = Math.max(shape.ridgeHeight - shape.eavesHeight, 0);
  const t = clamp(x, -halfWidth, halfWidth);
  if (shape.roofType === 'lean-to') return shape.eavesHeight + rise * ((t + halfWidth) / (2 * halfWidth));
  const ridge = shape.roofType === 'monitor' ? rise - monitorLift(rise) : rise;
  return shape.eavesHeight + ridge * (1 - Math.abs(t) / halfWidth);
}

export function buildShedLayout(shape: ShedShape): ShedLayout {
  const length = Math.max(shape.length, 0.5);
  const width = Math.max(shape.width, 0.5);
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const { eavesHeight, roofType } = shape;
  const ridgeHeight = Math.max(shape.ridgeHeight, eavesHeight + 0.05);
  const rise = ridgeHeight - eavesHeight;

  const bays = Math.max(1, Math.round(length / BAY_TARGET));
  const bayLength = length / bays;
  const frameZ = Array.from({ length: bays + 1 }, (_, i) => -halfLength + i * bayLength);

  const at = (x: number) => roofHeightAt({ ...shape, length, width, ridgeHeight }, x);
  let planes: RoofPlane[];
  let profile: Point2[];
  let monitor: ShedLayout['monitor'] = null;
  let wallTop = { left: eavesHeight, right: eavesHeight };

  if (roofType === 'lean-to') {
    const slope = rise / width;
    planes = [{ a: [-halfWidth - OVERHANG, eavesHeight - OVERHANG * slope], b: [halfWidth + OVERHANG, ridgeHeight + OVERHANG * slope] }];
    profile = [
      [-halfWidth, eavesHeight],
      [halfWidth, ridgeHeight],
    ];
    wallTop = { left: eavesHeight, right: ridgeHeight };
  } else if (roofType === 'monitor') {
    const lift = monitorLift(rise);
    const band = Math.max(0.2, Math.min(width * (MONITOR_SHARE / 2), halfWidth - 0.4));
    const slope = (rise - lift) / halfWidth;
    const capEdge = Math.min(band + MONITOR_OVERLAP, halfWidth - 0.1);
    monitor = { halfWidth: band, lift };
    planes = [
      { a: [-halfWidth - OVERHANG, eavesHeight - OVERHANG * slope], b: [-band, at(band)] },
      { a: [band, at(band)], b: [halfWidth + OVERHANG, eavesHeight - OVERHANG * slope] },
      { a: [-capEdge, at(capEdge) + lift], b: [0, ridgeHeight] },
      { a: [0, ridgeHeight], b: [capEdge, at(capEdge) + lift] },
    ];
    profile = [
      [-halfWidth, eavesHeight],
      [-band, at(band)],
      [-band, at(band) + lift],
      [0, ridgeHeight],
      [band, at(band) + lift],
      [band, at(band)],
      [halfWidth, eavesHeight],
    ];
  } else {
    const slope = rise / halfWidth;
    planes = [
      { a: [-halfWidth - OVERHANG, eavesHeight - OVERHANG * slope], b: [0, ridgeHeight] },
      { a: [0, ridgeHeight], b: [halfWidth + OVERHANG, eavesHeight - OVERHANG * slope] },
    ];
    profile = [
      [-halfWidth, eavesHeight],
      [0, ridgeHeight],
      [halfWidth, eavesHeight],
    ];
  }

  return {
    halfWidth,
    halfLength,
    eavesHeight,
    ridgeHeight,
    roofType,
    bays,
    bayLength,
    frameZ,
    planes,
    profile,
    wallTop,
    monitor,
    roofZ: { min: -halfLength - END_OVERHANG, max: halfLength + END_OVERHANG },
  };
}

/** The door: as wide as ENTRY_OPENING, and as tall as the eaves allow. */
export function doorSize(eavesHeight: number): { width: number; height: number } {
  return { width: ENTRY_OPENING.width, height: Math.max(1.2, Math.min(ENTRY_OPENING.height, eavesHeight - 0.15)) };
}

/** The anteroom in front of the door, or null when the entry has none. */
export function anteroom(entry: ShedEntry, eavesHeight: number): { width: number; depth: number; height: number } | null {
  if (entry !== 'anteroom') return null;
  const height = Math.max(doorSize(eavesHeight).height + 0.25, Math.min(ANTEROOM.height, eavesHeight));
  return { width: ANTEROOM.width, depth: ANTEROOM.depth, height };
}

/** How wide the entry is across the end wall: the anteroom, or the door. */
export function entryWidth(entry: ShedEntry): number {
  return entry === 'anteroom' ? ANTEROOM.width : ENTRY_OPENING.width;
}

/** How far the entry reaches out from the end wall: the anteroom and its footbath, or the footbath. */
export function entryDepth(entry: ShedEntry): number {
  if (entry === 'anteroom') return ANTEROOM.depth + FOOTBATH.depth;
  if (entry === 'door-footbath') return FOOTBATH.depth;
  return 0;
}

/* --------------------------------------------------------------------------------------------------------------- */
/* Inside: cages, feeding and birds                                                                                 */
/* --------------------------------------------------------------------------------------------------------------- */

/**
 * A-type (stepped) layer cages: each tier is a row of cages on both faces of the A, the lower tiers further out so
 * droppings fall clear of the birds below. Metres: cage depth and height, how far each tier steps out, the gap at
 * the apex, the height of the bottom tier, the gap between tiers, the aisle between rows, the trough in front and
 * the length of cage each drawn bird takes.
 */
export const CAGE = { depth: 0.4, height: 0.38, step: 0.2, gap: 0.1, base: 0.35, tierGap: 0.06, aisle: 0.8, trough: 0.12, slot: 0.15 } as const;

export interface CageTier {
  /** Distance from the row's centre line to the cage's inner and outer faces. */
  inner: number;
  outer: number;
  /** The cage floor. */
  y: number;
}

export interface CageRow {
  x: number;
  z0: number;
  z1: number;
  tiers: CageTier[];
  /** Half the row's footprint, troughs included. */
  halfWidth: number;
}

export interface Bird {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  scale: number;
  color: string;
}

export interface Line {
  x: number;
  z0: number;
  z1: number;
  y: number;
}

export interface InteriorLayout {
  mode: 'floor' | 'cage';
  /** The flock the shed holds and how many of them are drawn (BIRD_CAP). */
  birdsTotal: number;
  birdsShown: number;
  birds: Bird[];
  cageRows: CageRow[];
  /** Manual feeding: round tube feeders and bell drinkers on the floor. */
  feeders: Array<[number, number]>;
  drinkers: Array<[number, number]>;
  /** Pan feeder lines (raised on an auger tube when automatic), and the pans on them. */
  panLines: Line[];
  pans: Array<[number, number, number]>;
  /** Nipple drinker lines and their nipples. */
  nippleLines: Line[];
  nipples: Array<[number, number, number]>;
  /** Cage troughs: one along the front of every tier. */
  troughs: Line[];
  /** Automatic feeding: the feed silo outside, and the hoppers at the line ends (or the trolley over each cage row). */
  silo: [number, number] | null;
  hoppers: Array<[number, number, number]>;
  /** Brooders for the chicks of a meat flock. */
  brooders: Array<[number, number]>;
}

export interface InteriorInput {
  length: number;
  width: number;
  birdType: BirdType;
  feedingSystem: FeedingSystem;
  cageTiers: number;
  birds: number;
  quality: RenderQuality;
}

/** A small seeded random generator, so the flock looks the same on every render and in tests. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plumage colours: white commercial broilers and cage layers, brown floor layers, mixed desi birds. */
export const PLUMAGE: Record<BirdType, readonly string[]> = {
  broiler: ['#f6f3ec', '#efe9dd', '#faf8f2', '#ebe4d4'],
  'layer-cage': ['#f4f1e8', '#ece6d8', '#f8f5ee'],
  'layer-floor': ['#9a5a2e', '#a8643a', '#8b4a24', '#b5733f'],
  desi: ['#7a4a26', '#2f2a26', '#b07a3a', '#5b3a22', '#d9c7a5', '#8f2f1f', '#c8913f'],
};

/** Body size against a broiler at sale weight. */
export const BIRD_SCALE: Record<BirdType, number> = { broiler: 1, 'layer-cage': 0.82, 'layer-floor': 0.85, desi: 0.78 };

/** Picks `count` of `slots` indices, evenly spread. */
function spread(slots: number, count: number): number[] {
  if (count <= 0 || slots <= 0) return [];
  const n = Math.min(count, slots);
  return Array.from({ length: n }, (_, k) => Math.floor((k * slots) / n));
}

/** Points every `step` along a line, at most `cap` of them (the step widens past the cap). */
function along(z0: number, z1: number, step: number, cap: number): number[] {
  const span = Math.max(z1 - z0, 0);
  const count = Math.max(1, Math.min(Math.floor(span / step) + 1, cap));
  return Array.from({ length: count }, (_, i) => (count === 1 ? (z0 + z1) / 2 : z0 + (i * span) / (count - 1)));
}

/** The cage rows for a layer shed: as many A-frames as fit across the width, with aisles between them. */
export function buildCageRows(width: number, length: number, tierCount: number): CageRow[] {
  const tierTotal = clamp(Math.round(tierCount), 2, 4);
  const tiers: CageTier[] = Array.from({ length: tierTotal }, (_, i) => {
    const inner = CAGE.gap / 2 + (tierTotal - 1 - i) * CAGE.step;
    return { inner, outer: inner + CAGE.depth, y: CAGE.base + i * (CAGE.height + CAGE.tierGap) };
  });
  const halfWidth = tiers[0].outer + CAGE.trough;
  const rowWidth = 2 * halfWidth;
  const count = Math.max(1, Math.floor((width - CAGE.aisle) / (rowWidth + CAGE.aisle)));
  const total = count * rowWidth + (count - 1) * CAGE.aisle;
  const halfLength = length / 2;
  // Clear space at the back wall, and more at the entry for the egg trolley.
  let z0 = -halfLength + 0.9;
  let z1 = halfLength - 1.5;
  if (z1 - z0 < 0.6) {
    z0 = -0.3;
    z1 = 0.3;
  }
  return Array.from({ length: count }, (_, i) => ({ x: -total / 2 + halfWidth + i * (rowWidth + CAGE.aisle), z0, z1, tiers, halfWidth }));
}

export function buildInteriorLayout(input: InteriorInput): InteriorLayout {
  const length = Math.max(input.length, 0.5);
  const width = Math.max(input.width, 0.5);
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const { birdType, feedingSystem, quality } = input;
  const birdsTotal = Math.max(0, Math.floor(input.birds));
  const cap = BIRD_CAP[quality];
  const fittingCap = FITTING_CAP[quality];
  const random = seededRandom(Math.round(length * 1000) * 31 + Math.round(width * 1000) * 7 + birdType.length);
  const palette = PLUMAGE[birdType];
  const size = BIRD_SCALE[birdType];
  const colour = () => palette[Math.floor(random() * palette.length)];

  const layout: InteriorLayout = {
    mode: birdType === 'layer-cage' ? 'cage' : 'floor',
    birdsTotal,
    birdsShown: 0,
    birds: [],
    cageRows: [],
    feeders: [],
    drinkers: [],
    panLines: [],
    pans: [],
    nippleLines: [],
    nipples: [],
    troughs: [],
    silo: null,
    hoppers: [],
    brooders: [],
  };
  const automatic = feedingSystem === 'automatic';

  if (layout.mode === 'cage') {
    const rows = buildCageRows(width, length, input.cageTiers);
    layout.cageRows = rows;
    const tiers = rows[0].tiers;
    const perLine = Math.max(1, Math.floor((rows[0].z1 - rows[0].z0) / CAGE.slot));
    const slots = rows.length * 2 * tiers.length * perLine;
    for (const index of spread(slots, Math.min(cap, birdsTotal))) {
      const j = index % perLine;
      const tier = tiers[Math.floor(index / perLine) % tiers.length];
      const side = Math.floor(index / (perLine * tiers.length)) % 2 === 0 ? -1 : 1;
      const row = rows[Math.floor(index / (perLine * tiers.length * 2))];
      layout.birds.push({
        position: [row.x + side * (tier.inner + CAGE.depth * 0.55), tier.y + 0.02, row.z0 + (j + 0.5) * CAGE.slot],
        // Facing out over the trough.
        yaw: side * (Math.PI / 2) + (random() - 0.5) * 0.6,
        pitch: random() < 0.3 ? -0.45 : 0,
        scale: size * (0.92 + random() * 0.14),
        color: colour(),
      });
    }
    for (const row of rows) {
      for (const side of [-1, 1]) {
        for (const tier of tiers) {
          layout.troughs.push({ x: row.x + side * (tier.outer + CAGE.trough / 2), z0: row.z0, z1: row.z1, y: tier.y + 0.05 });
          layout.nippleLines.push({ x: row.x + side * (tier.inner + CAGE.depth * 0.5), z0: row.z0, z1: row.z1, y: tier.y + CAGE.height - 0.04 });
        }
      }
      // The feed trolley over each row, part way along its run on the rails.
      if (automatic) layout.hoppers.push([row.x, tiers[tiers.length - 1].y + CAGE.height + 0.25, row.z0 + (row.z1 - row.z0) * 0.35]);
    }
  } else {
    // Floor birds on litter, spread evenly with a little jitter and kept off the walls.
    const x0 = -halfWidth + 0.3;
    const x1 = halfWidth - 0.3;
    const z0 = -halfLength + 0.3;
    const z1 = halfLength - 0.3;
    const shown = Math.min(cap, birdsTotal);
    if (shown > 0 && x1 > x0 && z1 > z0) {
      const columns = Math.max(1, Math.ceil(Math.sqrt((shown * (x1 - x0)) / (z1 - z0))));
      const rows = Math.max(1, Math.ceil(shown / columns));
      const cellX = (x1 - x0) / columns;
      const cellZ = (z1 - z0) / rows;
      for (const index of spread(columns * rows, shown)) {
        const c = index % columns;
        const r = Math.floor(index / columns);
        layout.birds.push({
          position: [x0 + (c + 0.15 + random() * 0.7) * cellX, 0, z0 + (r + 0.15 + random() * 0.7) * cellZ],
          yaw: random() * Math.PI * 2,
          pitch: random() < 0.25 ? -0.5 : 0,
          scale: size * (0.9 + random() * 0.2),
          color: colour(),
        });
      }
    }

    const fx0 = -halfWidth + 0.8;
    const fx1 = halfWidth - 0.8;
    const fz0 = -halfLength + 0.9;
    const fz1 = halfLength - 1.6;
    const spacing = 2.4;
    if (feedingSystem === 'manual') {
      // A checkerboard of round feeders and bell drinkers, about 2.4 m apart.
      const columns = Math.max(1, Math.round(Math.max(fx1 - fx0, 0) / spacing) + 1);
      const rows = Math.max(1, Math.round(Math.max(fz1 - fz0, 0) / spacing) + 1);
      const xAt = (c: number) => (columns === 1 ? 0 : fx0 + (c * (fx1 - fx0)) / (columns - 1));
      const zAt = (r: number) => (rows === 1 ? (fz0 + fz1) / 2 : fz0 + (r * (fz1 - fz0)) / (rows - 1));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
          if (layout.feeders.length + layout.drinkers.length >= fittingCap) break;
          ((r + c) % 2 === 0 ? layout.feeders : layout.drinkers).push([xAt(c), zAt(r)]);
        }
      }
      // A shed with room for one fitting still gets water.
      if (layout.drinkers.length === 0) layout.drinkers.push([0, Math.min(fz1, halfLength - 0.6) - 0.6]);
    } else {
      // Lines down the length, alternating pan feeders and nipple drinkers, about 1.5 m apart.
      const count = Math.min(10, Math.max(2, Math.round((width - 1) / 1.5)));
      const left = -halfWidth + 0.6;
      const gap = Math.max(width - 1.2, 0) / Math.max(count - 1, 1);
      const lineZ0 = Math.min(fz0, -0.3);
      const lineZ1 = Math.max(fz1, 0.3);
      for (let i = 0; i < count; i += 1) {
        const x = left + i * gap;
        if (i % 2 === 0) layout.panLines.push({ x, z0: lineZ0, z1: lineZ1, y: automatic ? 0.42 : 0 });
        else layout.nippleLines.push({ x, z0: lineZ0, z1: lineZ1, y: 0.38 });
      }
      const panCap = Math.max(1, Math.floor(fittingCap / layout.panLines.length));
      for (const line of layout.panLines) {
        for (const z of along(line.z0, line.z1, 0.75, panCap)) layout.pans.push([line.x, 0, z]);
      }
      if (automatic) for (const line of layout.panLines) layout.hoppers.push([line.x, 0.75, line.z0 - 0.25]);
    }

    // Brooders for the chicks of a meat flock: a few hovers near the entry, about one per 40 m².
    if (birdType === 'broiler' || birdType === 'desi') {
      const count = clamp(Math.round((length * width) / 40), 1, 6);
      const columns = Math.min(count, Math.max(1, Math.floor(width / 2.5)));
      for (let i = 0; i < count; i += 1) {
        const c = i % columns;
        const r = Math.floor(i / columns);
        layout.brooders.push([-halfWidth + ((c + 0.5) * width) / columns, clamp(halfLength * 0.35 - r * 2.5, -halfLength + 1, halfLength - 1.5)]);
      }
    }
  }

  const nippleStep = layout.mode === 'cage' ? 0.45 : 0.3;
  const nippleCap = Math.max(1, Math.floor(fittingCap / Math.max(layout.nippleLines.length, 1)));
  for (const line of layout.nippleLines) {
    for (const z of along(line.z0, line.z1, nippleStep, nippleCap)) layout.nipples.push([line.x, line.y - 0.05, z]);
  }
  if (automatic) layout.silo = [-halfWidth - 1.8, -halfLength + 1.6];

  layout.birdsShown = layout.birds.length;
  return layout;
}
