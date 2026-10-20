import {
  BIRD_OPTIONS,
  DIMENSION_LIMITS,
  ENTRY_OPTIONS,
  FEEDING_OPTIONS,
  FRAME_OPTIONS,
  HOUSING_FOR_BIRD,
  HOUSING_OPTIONS,
  ROOF_OPTIONS,
  ROOF_SHEET_OPTIONS,
  SIDE_WALL_OPTIONS,
  feedingFor,
  keepCompatible,
  optionKey,
  type FarmConfig,
} from '@/types/farm';

/**
 * The editable parts of the shed: the design sidebar's tabs without the location. 'size' is the shed as a whole.
 * A part picked on the model opens the tab of the same name, and a tab selects its part.
 */
export type EditablePart = 'size' | 'housing' | 'roof' | 'frame' | 'roofSheet' | 'sideWalls' | 'entry' | 'birds' | 'feeding';

export type ResizeKey = 'length' | 'width' | 'eavesHeight' | 'ridgeHeight';

/** A grip on the model. 'corner' changes length and width together. */
export type HandleKey = ResizeKey | 'corner';

/** Dragging snaps as the sidebar's number boxes step: half metres for the footprint, 10 cm for heights. */
export const SNAP_STEP: Record<ResizeKey, number> = { length: 0.5, width: 0.5, eavesHeight: 0.1, ridgeHeight: 0.1 };

/** The ridge stays at least this far above the eaves, so every roof has a slope to shed rain. */
export const MIN_RISE = 0.5;

const snap = (value: number, step: number) => Math.round(value / step) * step;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number) => Number(value.toFixed(2));

/**
 * Turns a dragged value into a setup patch that always stays valid: snapped, inside the supported limits, and with
 * the ridge above the eaves.
 */
export function resizePatch(config: FarmConfig, key: ResizeKey, rawValue: number): Partial<FarmConfig> {
  if (!Number.isFinite(rawValue)) return {};
  const { min, max } = DIMENSION_LIMITS[key];
  const value = round(clamp(snap(rawValue, SNAP_STEP[key]), min, max));

  if (key === 'length' || key === 'width') return value === config[key] ? {} : { [key]: value };

  const ridgeLimits = DIMENSION_LIMITS.ridgeHeight;
  if (key === 'eavesHeight') {
    // Raising the eaves pushes the ridge up with it; the eaves stop where the ridge can go no higher.
    const ridgeHeight = round(Math.min(Math.max(config.ridgeHeight, value + MIN_RISE), ridgeLimits.max));
    const eavesHeight = round(Math.min(value, ridgeHeight - MIN_RISE));
    return eavesHeight === config.eavesHeight && ridgeHeight === config.ridgeHeight ? {} : { eavesHeight, ridgeHeight };
  }

  const ridgeHeight = round(Math.min(Math.max(value, config.eavesHeight + MIN_RISE), ridgeLimits.max));
  return ridgeHeight === config.ridgeHeight ? {} : { ridgeHeight };
}

/** The root group of the model; any hit inside it that names no other part selects the shed. */
export const MODEL_ROOT_NAME = 'farm-model';

/**
 * Which part of the model a named scene object belongs to; null for anything not editable. The roof sheet is the
 * roof's surface, so a click on it selects the roof (its shape and heights); the sheet has its own tab.
 */
export function partForObjectName(name: string): EditablePart | null {
  if (name.startsWith('roof-')) return 'roof';
  if (name.startsWith('frame-')) return 'frame';
  if (name.startsWith('walls-')) return 'sideWalls';
  if (name.startsWith('tunnel-')) return 'housing';
  if (name.startsWith('entry-')) return 'entry';
  if (name.startsWith('birds-') || name.startsWith('cages-') || name === 'litter') return 'birds';
  if (name.startsWith('feeding-')) return 'feeding';
  if (name === MODEL_ROOT_NAME) return 'size';
  return null;
}

/** Walks up from a hit object to the first ancestor that names an editable part. */
export function partForObject(object: { name: string; parent: unknown } | null): EditablePart | null {
  let current = object as { name: string; parent: unknown } | null;
  while (current) {
    const part = partForObjectName(current.name);
    if (part) return part;
    current = current.parent as { name: string; parent: unknown } | null;
  }
  return null;
}

/** True when a scene object is one of the named groups that make up a part (not the shed root). */
export function objectBelongsToPart(name: string, part: EditablePart): boolean {
  if (name === MODEL_ROOT_NAME) return false;
  if (part === 'roofSheet') return name === 'roof-sheet';
  // The shed type is its walls and, for a controlled shed, its pads and fans.
  if (part === 'housing' && name.startsWith('walls-')) return true;
  return partForObjectName(name) === part;
}

export const PART_ORDER: EditablePart[] = ['size', 'housing', 'roof', 'frame', 'roofSheet', 'sideWalls', 'entry', 'birds', 'feeding'];

export type OptionPart = Exclude<EditablePart, 'size'>;

/** The values each option part offers, in the sidebar's order. Sizes are edited by dragging, not by choosing. */
export const PART_VALUES: Record<OptionPart, readonly string[]> = {
  housing: HOUSING_OPTIONS.map((option) => option.value),
  roof: ROOF_OPTIONS.map((option) => option.value),
  frame: FRAME_OPTIONS.map((option) => option.value),
  roofSheet: ROOF_SHEET_OPTIONS.map((option) => option.value),
  sideWalls: SIDE_WALL_OPTIONS.map((option) => option.value),
  entry: ENTRY_OPTIONS.map((option) => option.value),
  birds: BIRD_OPTIONS.map((option) => option.value),
  feeding: FEEDING_OPTIONS.map((option) => option.value),
};

/** The setup field each option part sets. */
export const CONFIG_FIELD: Record<OptionPart, keyof FarmConfig> = {
  housing: 'housingSystem',
  roof: 'roofType',
  frame: 'frameMaterial',
  roofSheet: 'roofSheet',
  sideWalls: 'sideWalls',
  entry: 'entry',
  birds: 'birdType',
  feeding: 'feedingSystem',
};

/** The i18n group of each part's option labels (`options.<group>.<value>`). */
export const OPTION_GROUP: Record<OptionPart, string> = {
  housing: 'housing',
  roof: 'roof',
  frame: 'frame',
  roofSheet: 'roofSheet',
  sideWalls: 'sideWalls',
  entry: 'entry',
  birds: 'bird',
  feeding: 'feeding',
};

/**
 * True when a value cannot be chosen for this shed: a shed type the bird is not kept in, feeding that does not fit
 * the bird, closed walls without a controlled shed (and open walls with one), bamboo and thatch outside a backyard
 * shed. The same rules as keepCompatible in src/types/farm.ts.
 */
export function isOptionLocked(part: OptionPart, value: string, config: FarmConfig): boolean {
  const housing = config.housingSystem;
  switch (part) {
    case 'housing':
      return !HOUSING_FOR_BIRD[config.birdType].includes(value as FarmConfig['housingSystem']);
    case 'frame':
      return (value === 'bamboo-wood') !== (housing === 'backyard');
    case 'roofSheet':
      return value === 'thatch' && housing !== 'backyard';
    case 'sideWalls':
      return (value === 'closed-tunnel') !== (housing === 'environment-controlled');
    case 'feeding':
      return !feedingFor(config.birdType).includes(value as FarmConfig['feedingSystem']);
    default:
      return false;
  }
}

/** The patch for choosing an option, including the knock-on changes some choices need (keepCompatible). */
export function optionPatch(part: OptionPart, value: string, config: FarmConfig): Partial<FarmConfig> {
  const field = CONFIG_FIELD[part];
  const next = keepCompatible({ ...config, [field]: value } as FarmConfig);
  const patch: Partial<FarmConfig> = {};
  for (const key of Object.keys(next) as Array<keyof FarmConfig>) {
    if (next[key] !== config[key]) (patch as Record<string, unknown>)[key] = next[key];
  }
  return patch;
}

/**
 * The patch that steps a part to its next (or previous) available option, skipping locked ones and wrapping
 * around; empty when there is nothing else to choose.
 */
export function cycleOptionPatch(part: OptionPart, config: FarmConfig, direction: 1 | -1): Partial<FarmConfig> {
  const values = PART_VALUES[part];
  const current = values.indexOf(String(config[CONFIG_FIELD[part]]));
  for (let step = 1; step < values.length; step += 1) {
    const index = (((current + direction * step) % values.length) + values.length) % values.length;
    const value = values[index];
    if (!isOptionLocked(part, value, config)) return optionPatch(part, value, config);
  }
  return {};
}

export type FocusTarget = 'entry' | 'walls' | 'feeding' | 'fans';

/** The camera view that shows a part best, when there is one. */
export const PART_FOCUS: Partial<Record<EditablePart, FocusTarget>> = {
  entry: 'entry',
  sideWalls: 'walls',
  feeding: 'feeding',
};

/** The grips a selected part offers. Parts chosen from a list (entry, birds, ...) offer none. */
export function handlesForPart(part: EditablePart | null): HandleKey[] {
  if (part === 'size' || part === 'frame') return ['length', 'width', 'corner', 'eavesHeight', 'ridgeHeight'];
  if (part === 'sideWalls') return ['length', 'width', 'corner', 'eavesHeight'];
  if (part === 'roof' || part === 'roofSheet') return ['eavesHeight', 'ridgeHeight'];
  return [];
}

/** Distance between the walls and the grips that sit outside them. */
export const HANDLE_GAP = 1.4;
/** How far the ridge grip floats above the ridge. */
export const RIDGE_GAP = 0.7;

/**
 * Converts where the pointer is along a grip's axis (world metres, from the shed centre) into the dimension it
 * controls. The shed is centred, so moving one wall moves the opposite one too.
 */
export function handleValue(key: ResizeKey, coordinate: number): number {
  if (key === 'length' || key === 'width') return 2 * (coordinate - HANDLE_GAP);
  if (key === 'ridgeHeight') return coordinate - RIDGE_GAP;
  return coordinate;
}

/** The patch for a drag of the corner grip to (x, z) on the ground. */
export function cornerPatch(config: FarmConfig, x: number, z: number): Partial<FarmConfig> {
  return {
    ...resizePatch(config, 'width', handleValue('width', x)),
    ...resizePatch(config, 'length', handleValue('length', z)),
  };
}

const formatMetres = (value: number) => String(Number(value.toFixed(2)));

/** Blender-style header text for a drag: "Length 32 m (+4)". */
export function dragReadout(label: string, value: number, start: number): string {
  const delta = Number((value - start).toFixed(2));
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${label} ${formatMetres(value)} m (${sign}${formatMetres(Math.abs(delta))})`;
}

/** The i18n key for an option of a part. */
export function optionLabelKey(part: OptionPart, value: string): string {
  return optionKey(OPTION_GROUP[part], value);
}

/** The i18n key naming a part: the sidebar tab of the same name. */
export const partLabelKey = (part: EditablePart) => `design.tab.${part}`;

/**
 * Approximate roof sheet area: both slopes (or the one slope of a lean-to) over the length, with the overhang the
 * shed is drawn with. A monitor roof adds its raised cap.
 */
export function roofSurface(
  config: Pick<FarmConfig, 'length' | 'width' | 'eavesHeight' | 'ridgeHeight' | 'roofType'>,
  overhang = 1.07
): number {
  const { length, width, eavesHeight, ridgeHeight, roofType } = config;
  const rise = Math.max(ridgeHeight - eavesHeight, 0);
  if (roofType === 'lean-to') return Math.hypot(width + 2 * overhang, rise) * length;
  const slope = Math.hypot(width / 2 + overhang, rise);
  const cap = roofType === 'monitor' ? Math.hypot(width * 0.12, 0.2) * 2 : 0;
  return (2 * slope + cap) * length;
}
