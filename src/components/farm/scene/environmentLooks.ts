import * as THREE from 'three';
import type { EnvironmentId, SceneReach, SkyId } from '@/lib/sceneEnvironment';
import type { RenderQuality } from './shedLayout';

/**
 * What each landscape and sky looks like, and where the scenery around the house goes. Pure apart
 * from THREE.Color maths, so the placement rules (nothing on or right next to the house, nothing past
 * the camera's far plane) are unit tested; EnvironmentBackdrop turns the plan into meshes.
 */

/** The ground plane sits just under the grid and the house foundation, so they never z-fight. */
export const GROUND_Y = -0.04;
/** Clear ground kept round the house (metres past the walls) before any tree, field or hill. */
export const HOUSE_MARGIN = 8;
/** PerspectiveCamera's default far plane (MiddlePanel does not set one). */
export const CAMERA_FAR = 2000;

export type TreeKind = 'broadleaf' | 'palm' | 'conifer' | 'khejri' | 'scrub';
export type FarKind = 'treeline' | 'mesa' | 'dune' | 'hill' | 'ridge' | 'peak';

interface TreeMix {
  kind: TreeKind;
  /** Trees of this kind at high quality. */
  count: number;
  /** Foliage colours (the wood is coloured by the geometry). */
  colors: string[];
  /** Height range, metres. */
  height: [number, number];
}

interface FarMix {
  kind: FarKind;
  count: number;
  /** Ring, as fractions of the fog's far distance. */
  ring: [number, number];
  /** Base radius and height ranges, metres for the smallest house (they grow with the fog distance). */
  radius: [number, number];
  height: [number, number];
  colors: string[];
}

export interface LandscapeLook {
  /** Main ground colour, a second one it drifts into, and an occasional patch colour (laterite, sand). */
  ground: string;
  groundAlt: string;
  groundPatch: string;
  /** Share of the ground the patch colour covers (0..1). */
  patchShare: number;
  /** Grass tuft colours near the house, and how many of them (1 = the old meadow). */
  grass: string[];
  grassDensity: number;
  /** Grid lines near the house, for scale (null: no grid). */
  grid: { cell: string; section: string } | null;
  /** Dust or humidity mixed into the fog colour, and how much. */
  haze: string;
  hazeWeight: number;
  /** Multiplies the fog distances: below 1 is a hazier place. */
  fogScale: number;
  /** Rolling ground past the trees: height in metres, wavelength, and a rise with distance. */
  relief: { amp: number; scale: number; rise: number };
  /** Crop fields (flat patches) round the house: colours and how much of the land is under them. */
  fields: { colors: string[]; share: number; size: [number, number] } | null;
  /** Rows of tea bushes near the house (hills). */
  teaRows: boolean;
  /** Terraced mounds at mid distance (mountains). */
  terraces: boolean;
  trees: TreeMix[];
  far: FarMix[];
}

export const LANDSCAPE_LOOKS: Record<EnvironmentId, LandscapeLook> = {
  // Indo-Gangetic plain: flat alluvium, wheat and mustard fields, mango and neem, a hazy tree line.
  plains: {
    ground: '#86ad58',
    groundAlt: '#97ab5e',
    groundPatch: '#b59a6a',
    patchShare: 0.12,
    grass: ['#6f9e47', '#7fae52', '#5f8f3d', '#9aa860', '#86a24c'],
    grassDensity: 1,
    grid: { cell: '#6f8a4a', section: '#5a7240' },
    haze: '#d8d2bd',
    hazeWeight: 0.35,
    fogScale: 0.92,
    relief: { amp: 0, scale: 60, rise: 0 },
    fields: { colors: ['#c9b25a', '#d6bf63', '#6f9a3c', '#7fa645', '#d9c23c', '#5e8a35', '#b9a16a'], share: 0.85, size: [16, 26] },
    teaRows: false,
    terraces: false,
    trees: [{ kind: 'broadleaf', count: 70, colors: ['#3f6b2c', '#4a7a33', '#36602a', '#557f38'], height: [6, 10] }],
    far: [{ kind: 'treeline', count: 34, ring: [0.5, 0.8], radius: [14, 26], height: [8, 12], colors: ['#3a5a30', '#425f34', '#4b6a38'] }],
  },
  // Deccan plateau: red-brown soil, dry grass, flat-topped basalt hills, sparse scrub.
  deccan: {
    ground: '#a9805a',
    groundAlt: '#b8a06a',
    groundPatch: '#9a6446',
    patchShare: 0.2,
    grass: ['#a8a25a', '#b9aa62', '#8f9a4c', '#c4b06c', '#9c8f52'],
    grassDensity: 0.7,
    grid: { cell: '#8a6648', section: '#76543a' },
    haze: '#e2d2b8',
    hazeWeight: 0.3,
    fogScale: 1.05,
    relief: { amp: 0, scale: 60, rise: 0 },
    fields: { colors: ['#9a5f3e', '#b98c5a', '#c3ad6b', '#6f8f3a', '#a5703f'], share: 0.35, size: [18, 30] },
    teaRows: false,
    terraces: false,
    trees: [
      { kind: 'broadleaf', count: 30, colors: ['#5a7232', '#647a38', '#4d6a2e'], height: [5, 8] },
      { kind: 'scrub', count: 60, colors: ['#7f8a3e', '#8f9446', '#71823a'], height: [1, 2.2] },
    ],
    far: [{ kind: 'mesa', count: 14, ring: [0.62, 0.92], radius: [40, 75], height: [11, 19], colors: ['#ffffff', '#f3e9e0', '#e8ddd2'] }],
  },
  // Tropical coast: lush green with red laterite, coconut palms everywhere, low green hills, humid haze.
  coastal: {
    ground: '#6f9e45',
    groundAlt: '#5f9140',
    groundPatch: '#a3654a',
    patchShare: 0.14,
    grass: ['#4f9a3a', '#5ea842', '#3f8a32', '#6fb04a', '#58983c'],
    grassDensity: 1.25,
    grid: { cell: '#557f38', section: '#466c2e' },
    haze: '#eef2ee',
    hazeWeight: 0.45,
    fogScale: 0.85,
    relief: { amp: 0, scale: 60, rise: 0 },
    fields: { colors: ['#6aa83e', '#77b347', '#5f9a3a'], share: 0.2, size: [14, 22] },
    teaRows: false,
    terraces: false,
    trees: [
      { kind: 'palm', count: 130, colors: ['#4f8a2f', '#5a9634', '#447a2a', '#62a03a'], height: [8, 14] },
      { kind: 'broadleaf', count: 25, colors: ['#2f6a2a', '#38752f', '#2a5f26'], height: [6, 10] },
    ],
    far: [{ kind: 'hill', count: 11, ring: [0.72, 0.92], radius: [50, 90], height: [14, 24], colors: ['#3f7a35', '#46833a', '#3a6f31'] }],
  },
  // Thar and Kutch: sand, low dunes, khejri and thorny scrub, glare.
  arid: {
    ground: '#d8bf8c',
    groundAlt: '#e3cc98',
    groundPatch: '#c9a774',
    patchShare: 0.25,
    grass: ['#b9a86a', '#a89a5c', '#c4b27a', '#9c9a5a'],
    grassDensity: 0.22,
    grid: { cell: '#b89e6e', section: '#a08660' },
    haze: '#f0e2c4',
    hazeWeight: 0.5,
    fogScale: 1.1,
    relief: { amp: 1.2, scale: 40, rise: 0 },
    fields: null,
    teaRows: false,
    terraces: false,
    trees: [
      { kind: 'khejri', count: 26, colors: ['#7a8a48', '#86914e', '#6f7f42'], height: [4, 6.5] },
      { kind: 'scrub', count: 55, colors: ['#8a8a4e', '#9a9456', '#7c8448'], height: [0.8, 1.8] },
    ],
    far: [{ kind: 'dune', count: 16, ring: [0.45, 0.85], radius: [40, 80], height: [8, 16], colors: ['#e2c896', '#dbbd88', '#e8d2a2'] }],
  },
  // North-East, Western Ghats, Nilgiris: rolling green hills, dense trees, tea rows, mist.
  hills: {
    ground: '#5f9142',
    groundAlt: '#6e9c48',
    groundPatch: '#4f7f3a',
    patchShare: 0.25,
    grass: ['#4f8f38', '#5c9a40', '#447e32', '#68a446'],
    grassDensity: 1.2,
    grid: { cell: '#4e7a36', section: '#40682e' },
    haze: '#eef3f2',
    hazeWeight: 0.6,
    fogScale: 0.72,
    relief: { amp: 5, scale: 45, rise: 0.4 },
    fields: null,
    teaRows: true,
    terraces: false,
    trees: [{ kind: 'broadleaf', count: 170, colors: ['#2f5f2a', '#356a2e', '#2a5426', '#3e7232', '#2c4f2a'], height: [7, 12] }],
    far: [{ kind: 'hill', count: 18, ring: [0.5, 0.9], radius: [50, 90], height: [18, 32], colors: ['#3d7034', '#447a38', '#356630', '#4a7f3a'] }],
  },
  // Himalaya: green slopes and terraces, deodar and pine, snow peaks behind.
  mountains: {
    ground: '#6f9152',
    groundAlt: '#7c9a58',
    groundPatch: '#8a7e5c',
    patchShare: 0.15,
    grass: ['#5f8f42', '#6c9a48', '#53803a', '#7a9e50'],
    grassDensity: 0.9,
    grid: { cell: '#5a7a42', section: '#4a6838' },
    haze: '#e8eef4',
    hazeWeight: 0.35,
    fogScale: 1.1,
    relief: { amp: 5, scale: 55, rise: 0.3 },
    fields: null,
    teaRows: false,
    terraces: true,
    trees: [{ kind: 'conifer', count: 120, colors: ['#2a4a30', '#2f5434', '#24402a', '#355a38'], height: [8, 15] }],
    far: [
      { kind: 'ridge', count: 12, ring: [0.55, 0.72], radius: [50, 80], height: [12, 22], colors: ['#3a5c3e', '#406442', '#34553a'] },
      { kind: 'peak', count: 9, ring: [0.88, 1], radius: [80, 130], height: [110, 170], colors: ['#ffffff', '#eef2f8', '#f4f6fa'] },
    ],
  },
};

export interface SkyLook {
  /** Direction towards the sun (or moon), its colour and intensity. */
  sun: { direction: [number, number, number]; color: string; intensity: number };
  /** Soft fill from the opposite side and a cool rim from behind. */
  fill: { color: string; intensity: number };
  rim: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  ambient: number;
  /** Fog colour (also the background when no sky dome is drawn) and its distance multipliers. */
  fog: string;
  fogNear: number;
  fogFar: number;
  /** drei <Sky> settings on high quality (with its own sun, which may sit lower than the light); null for a plain coloured sky. */
  dome: { sun: [number, number, number]; turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number } | null;
  stars: boolean;
  /** How much of the landscape's haze colour reaches the fog (0 at night). */
  hazeTint: number;
  /** Shadows from the sun: off under a thick monsoon sky. */
  shadows: boolean;
  clouds: { color: string; opacity: number; count: number };
  /** Pollen in the day, fireflies at night. */
  motes: string;
  /** Multiplies the foliage and ground colours (the dark is darker than any light setting gives). */
  shade: number;
}

export const SKY_LOOKS: Record<SkyId, SkyLook> = {
  // Bright Indian midday: high sun, pale blue sky.
  day: {
    sun: { direction: [0.58, 0.74, 0.35], color: '#fff6e6', intensity: 1.2 },
    fill: { color: '#f9efe1', intensity: 0.42 },
    rim: { color: '#d7e8ff', intensity: 0.26 },
    hemisphere: { sky: '#fff6dc', ground: '#6f7d6d', intensity: 0.4 },
    ambient: 0.24,
    fog: '#dfe7ea',
    fogNear: 1,
    fogFar: 1,
    dome: { sun: [0.58, 0.74, 0.35], turbidity: 8, rayleigh: 1.1, mieCoefficient: 0.004, mieDirectionalG: 0.8 },
    stars: false,
    hazeTint: 1,
    shadows: true,
    clouds: { color: '#ffffff', opacity: 0.82, count: 1 },
    motes: '#fff6c8',
    shade: 1,
  },
  // An hour before sunset: low warm sun from the west, long shadows, orange and pink horizon.
  golden: {
    sun: { direction: [-0.86, 0.2, 0.46], color: '#ffad66', intensity: 1.55 },
    fill: { color: '#a8b6e0', intensity: 0.3 },
    rim: { color: '#ffc9a0', intensity: 0.3 },
    hemisphere: { sky: '#ffd2a6', ground: '#5d4a3c', intensity: 0.45 },
    ambient: 0.16,
    fog: '#eac4a4',
    fogNear: 1,
    fogFar: 1,
    dome: { sun: [-0.86, 0.035, 0.46], turbidity: 12, rayleigh: 3.5, mieCoefficient: 0.006, mieDirectionalG: 0.93 },
    stars: false,
    hazeTint: 0.35,
    shadows: true,
    clouds: { color: '#ffc4a0', opacity: 0.85, count: 1 },
    motes: '#ffd79a',
    shade: 0.95,
  },
  // Monsoon: a low grey sky, flat light, weak shadows, thick haze.
  overcast: {
    sun: { direction: [0.3, 0.9, 0.3], color: '#e6ecf2', intensity: 0.38 },
    fill: { color: '#dfe6ec', intensity: 0.22 },
    rim: { color: '#d0dae4', intensity: 0.18 },
    hemisphere: { sky: '#e2e8ec', ground: '#596258', intensity: 1.05 },
    ambient: 0.32,
    fog: '#b9c1c6',
    fogNear: 0.55,
    fogFar: 0.72,
    dome: null,
    stars: false,
    hazeTint: 0.25,
    shadows: false,
    clouds: { color: '#9aa3ab', opacity: 0.9, count: 2.2 },
    motes: '#e8eef0',
    shade: 0.92,
  },
  // Moonlit night: cool dim key, dark blue sky, stars; enough ambient to read the house.
  night: {
    sun: { direction: [-0.35, 0.82, -0.45], color: '#a8bcff', intensity: 0.55 },
    fill: { color: '#6a7fb8', intensity: 0.22 },
    rim: { color: '#8fa6e6', intensity: 0.2 },
    hemisphere: { sky: '#4a5f9a', ground: '#1a2030', intensity: 0.9 },
    ambient: 0.22,
    fog: '#0d1528',
    fogNear: 0.8,
    fogFar: 0.95,
    dome: null,
    stars: true,
    hazeTint: 0,
    shadows: true,
    clouds: { color: '#2b3650', opacity: 0.55, count: 0.6 },
    motes: '#d8ff8a',
    shade: 0.8,
  },
};

const mixColor = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** Fog colour and distances for a landscape under a sky. Lite fogs in closer, as before. */
export function sceneFog(environment: EnvironmentId, sky: SkyId, reach: SceneReach, quality: RenderQuality) {
  const land = LANDSCAPE_LOOKS[environment];
  const look = SKY_LOOKS[sky];
  const lite = quality === 'lite';
  return {
    color: mixColor(look.fog, land.haze, land.hazeWeight * look.hazeTint),
    near: reach.fogNear * land.fogScale * look.fogNear * (lite ? 0.77 : 1),
    far: reach.fogFar * land.fogScale * look.fogFar * (lite ? 0.72 : 1),
  };
}

/** The hemisphere light's ground colour picks up the landscape's soil. */
export function hemisphereGround(environment: EnvironmentId, sky: SkyId) {
  return mixColor(SKY_LOOKS[sky].hemisphere.ground, LANDSCAPE_LOOKS[environment].ground, sky === 'night' ? 0.15 : 0.45);
}

/** A colour darkened by the sky's shade (night foliage, monsoon ground). */
export function shaded(color: string, shade: number) {
  return shade === 1 ? color : `#${new THREE.Color(color).multiplyScalar(shade).getHexString()}`;
}

// ---------------------------------------------------------------------------------------------
// Placement

/** Small seeded PRNG so the landscape is identical between renders. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface HouseClearance {
  /** Half-width and half-length of the house plus the margin. */
  hx: number;
  hz: number;
  /** Radius inside which the ground stays flat. */
  flat: number;
  /** Nearest radius for trees, so they stand behind the default camera rather than between it and the house. */
  treeInner: number;
  /** Direction (round Y, from +X towards +Z) the camera starts from. */
  cameraAngle: number;
}

export function houseClearance(length: number, width: number): HouseClearance {
  const hx = width / 2 + HOUSE_MARGIN;
  const hz = length / 2 + HOUSE_MARGIN;
  const corner = Math.hypot(hx, hz);
  // MiddlePanel starts the camera at (1.5 w, 2 ridge, 1.2 l).
  const camera = Math.hypot(width * 1.5, length * 1.2);
  const treeInner = Math.max(Math.max(hx, hz) + 6, camera * 0.95, 24);
  return { hx, hz, flat: Math.max(corner + 4, treeInner + 20), treeInner, cameraAngle: Math.atan2(length * 1.2, width * 1.5) };
}

/** True when a footprint of the given radius round (x, z) stays clear of the house and its margin. */
export function outsideHouse(x: number, z: number, radius: number, clear: Pick<HouseClearance, 'hx' | 'hz'>) {
  return Math.abs(x) > clear.hx + radius || Math.abs(z) > clear.hz + radius;
}

/**
 * True when something tall at (x, z) would stand between the house and one of the preset camera
 * views: front, back and both sides look along the axes, the starting view along a diagonal. Only
 * within the camera's reach; past it nothing can come between.
 */
export function inViewCorridor(x: number, z: number, radius: number, clear: HouseClearance, reach: SceneReach) {
  if (Math.hypot(x, z) - radius > reach.maxDistance + 10) return false;
  if (Math.abs(x) < clear.hx + radius || Math.abs(z) < clear.hz + radius) return true;
  // The starting view and its mirror images round the house (the camera may orbit to any corner).
  const angle = Math.atan2(Math.abs(z), Math.abs(x));
  const spread = 0.22 + Math.atan2(radius, Math.hypot(x, z));
  return Math.abs(angle - clear.cameraAngle) < spread;
}

/** Height of the ground at (x, z): flat round the house, rolling (and rising, in the mountains) past the trees. */
export function groundHeight(look: LandscapeLook, x: number, z: number, flat: number): number {
  const { amp, scale, rise } = look.relief;
  if (amp === 0) return GROUND_Y;
  const r = Math.hypot(x, z);
  const ramp = smoothstep(flat, flat * 1.6 + 30, r);
  if (ramp === 0) return GROUND_Y;
  const wave = 0.5 + 0.25 * Math.sin(x / scale + 1.3) * Math.cos(z / (scale * 1.3) - 0.7) + 0.25 * Math.sin((x * 0.6 + z * 0.8) / (scale * 0.6) + 2.1);
  return GROUND_Y + amp * ramp * (0.35 + 0.65 * wave) * (1 + (rise * Math.max(0, r - flat)) / 100);
}

/** One object of the backdrop: where it stands, its scale, turn and colour, and its footprint radius. */
export interface Placement {
  x: number;
  y: number;
  z: number;
  scale: [number, number, number];
  yaw: number;
  color: string;
  /** Radius of the ground it covers, for the clearance checks. */
  footprint: number;
}

export interface BackdropPlan {
  clear: HouseClearance;
  /** Radius of the ground disc (past the fog, so its edge never shows). */
  groundRadius: number;
  trees: { kind: TreeKind; items: Placement[] }[];
  far: { kind: FarKind; items: Placement[] }[];
  /** Flat crop fields: x/z size in scale[0]/scale[2]. */
  fields: Placement[];
  teaRows: Placement[];
  /** Each terrace step: a cylinder slice (scale = radius, height, radius). */
  terraces: Placement[];
}

const QUALITY_SHARE: Record<RenderQuality, { trees: number; far: number }> = {
  high: { trees: 1, far: 1 },
  balanced: { trees: 0.6, far: 1 },
  lite: { trees: 0.3, far: 0.6 },
};

/**
 * Where every tree, field, hill and peak goes for this landscape and house. Everything keeps clear of
 * the house footprint plus HOUSE_MARGIN; the far scenery stands on a ring at half to nine-tenths of
 * the fog distance, so the fog blends it into the sky.
 */
export function buildBackdropPlan(environment: EnvironmentId, quality: RenderQuality, reach: SceneReach, length: number, width: number): BackdropPlan {
  const look = LANDSCAPE_LOOKS[environment];
  const share = QUALITY_SHARE[quality];
  const clear = houseClearance(length, width);
  const fogFar = reach.fogFar * look.fogScale;
  const fogNear = reach.fogNear * look.fogScale;
  // Bigger houses get a bigger world: far scenery grows with the fog distance, trees a little.
  const farScale = fogFar / 320;
  const treeScale = Math.sqrt(Math.max(1, reach.extent / 50));
  const groundRadius = reach.fogFar * 1.15;
  const height = (x: number, z: number) => groundHeight(look, x, z, clear.flat);
  const occupied: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, r: number) =>
    outsideHouse(x, z, r, clear) && !inViewCorridor(x, z, r, clear, reach) && occupied.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r * 0.5);

  // Terraced mounds first, so trees do not grow out of them.
  const terraces: Placement[] = [];
  if (look.terraces) {
    const rand = rng(41);
    const mounds = quality === 'lite' ? 4 : 7;
    for (let i = 0; i < mounds; i += 1) {
      const angle = ((i + rand() * 0.7) / mounds) * Math.PI * 2;
      const base = (14 + rand() * 10) * treeScale;
      const ring = clear.treeInner + base * 1.6 + 10 + rand() * Math.max(20, fogNear * 0.5);
      const x = Math.cos(angle) * ring;
      const z = Math.sin(angle) * ring;
      if (!outsideHouse(x, z, base * 1.6, clear) || inViewCorridor(x, z, base * 1.6, clear, reach)) continue;
      occupied.push({ x, z, r: base * 1.6 });
      const steps = 4;
      const y0 = height(x, z) - 0.6;
      // Stretched along the hillside, so the steps read as terraced fields rather than a cake.
      const yaw = -angle + Math.PI / 2;
      for (let s = 0; s < steps; s += 1) {
        const r = base * (1 - s / (steps + 1));
        terraces.push({ x, y: y0 + s * 1.7, z, scale: [r * 1.6, 1.7, r], yaw, color: rand() > 0.5 ? '#ffffff' : '#eef2e2', footprint: r * 1.6 });
      }
    }
  }

  // Tea rows: a few patches of parallel hedges on the flat ground near the house.
  const teaRows: Placement[] = [];
  if (look.teaRows) {
    const rand = rng(53);
    const patches = quality === 'lite' ? 2 : 4;
    const rowLength = 22;
    for (let p = 0; p < patches; p += 1) {
      // Spread round the house, never on the side the camera starts from.
      const angle = clear.cameraAngle + ((p + 0.5 + (rand() - 0.5) * 0.3) / patches) * Math.PI * 2;
      const ring = Math.max(clear.hx, clear.hz) + rowLength / 2 + 6 + rand() * 10;
      const cx = Math.cos(angle) * ring;
      const cz = Math.sin(angle) * ring;
      const yaw = angle + Math.PI / 2;
      for (let row = -6; row <= 6; row += 1) {
        // Rows run across the radius; step outward along it.
        const x = cx + Math.cos(angle) * row * 1.8;
        const z = cz + Math.sin(angle) * row * 1.8;
        if (!outsideHouse(x, z, rowLength / 2, clear)) continue;
        teaRows.push({ x, y: height(x, z), z, scale: [0.95, 0.85, rowLength], yaw, color: rand() > 0.5 ? '#3c6a2e' : '#467634', footprint: rowLength / 2 });
      }
      occupied.push({ x: cx, z: cz, r: rowLength * 0.7 });
    }
  }

  // Crop fields: a tilted patchwork of plots with earth bunds between, some left fallow.
  const fields: Placement[] = [];
  if (look.fields) {
    const rand = rng(67);
    const [fw, fl] = look.fields.size.map((s) => s * treeScale);
    const reachOut = Math.min(fogNear * 1.4, fogFar * 0.7);
    const tilt = 0.21;
    const gap = 1.4;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const half = Math.hypot(fw, fl) / 2;
    const columns = Math.ceil(reachOut / (fw + gap));
    const rows = Math.ceil(reachOut / (fl + gap));
    for (let i = -columns; i <= columns; i += 1) {
      for (let j = -rows; j <= rows; j += 1) {
        if (rand() > look.fields.share) continue;
        const u = i * (fw + gap);
        const v = j * (fl + gap) + (i % 2) * fl * 0.35;
        const x = u * cos + v * sin;
        const z = -u * sin + v * cos;
        if (Math.hypot(x, z) + half > reachOut || !outsideHouse(x, z, half, clear)) continue;
        const color = look.fields.colors[Math.floor(rand() * look.fields.colors.length)];
        fields.push({ x, y: height(x, z) + 0.01, z, scale: [fw, 1, fl], yaw: tilt, color, footprint: half });
      }
    }
  }

  // Trees between the camera's starting ring and the start of the fog's thick part.
  const trees: BackdropPlan['trees'] = [];
  const outer = Math.max(clear.treeInner + 60, fogNear * 1.15);
  look.trees.forEach((mix, k) => {
    const rand = rng(101 + k * 17);
    const items: Placement[] = [];
    const wanted = Math.round(mix.count * share.trees);
    let guard = 0;
    while (items.length < wanted && guard < wanted * 30) {
      guard += 1;
      // Even over the ring's area, then a nudge towards clumps.
      const r = Math.sqrt(clear.treeInner ** 2 + rand() * (outer ** 2 - clear.treeInner ** 2));
      const angle = rand() * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const h = (mix.height[0] + rand() * (mix.height[1] - mix.height[0])) * treeScale;
      const footprint = h * 0.35;
      if (!free(x, z, footprint)) continue;
      const color = mix.colors[Math.floor(rand() * mix.colors.length)];
      const spread = 0.85 + rand() * 0.3;
      items.push({ x, y: height(x, z) - 0.05, z, scale: [h * spread, h, h * spread], yaw: rand() * Math.PI * 2, color, footprint });
    }
    trees.push({ kind: mix.kind, items });
  });

  // Far scenery, evenly round the horizon with some jitter.
  const far: BackdropPlan['far'] = look.far.map((mix, k) => {
    const rand = rng(211 + k * 29);
    const count = Math.max(3, Math.round(mix.count * share.far));
    const items: Placement[] = [];
    for (let i = 0; i < count; i += 1) {
      const angle = ((i + rand() * 0.8) / count) * Math.PI * 2;
      const ring = fogFar * (mix.ring[0] + rand() * (mix.ring[1] - mix.ring[0]));
      const radius = (mix.radius[0] + rand() * (mix.radius[1] - mix.radius[0])) * farScale;
      const h = (mix.height[0] + rand() * (mix.height[1] - mix.height[0])) * farScale;
      const stretch = 1.2 + rand() * 0.6;
      // Keep the near edge clear of the house too, however large the hill.
      let r = ring;
      while (!outsideHouse(Math.cos(angle) * r, Math.sin(angle) * r, radius * stretch, clear)) r += 5;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      items.push({
        x,
        y: height(x, z) - 0.5,
        z,
        scale: [radius * stretch, h, radius],
        // Long side along the horizon, so a ridge reads as a ridge.
        yaw: -angle + Math.PI / 2 + (rand() - 0.5) * 0.6,
        color: mix.colors[Math.floor(rand() * mix.colors.length)],
        footprint: radius * stretch,
      });
    }
    return { kind: mix.kind, items };
  });

  return { clear, groundRadius, trees, far, fields, teaRows, terraces };
}
