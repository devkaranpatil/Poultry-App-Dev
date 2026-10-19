import {
  CROP_OPTIONS,
  DIMENSION_LIMITS,
  DOOR_ENTRY_OPTIONS,
  IRRIGATION_SYSTEM_OPTIONS,
  SIDE_VENTILATION_OPTIONS,
  type GreenhouseConfig,
} from '@/types/greenhouse';

/** The editable parts of the model, as named by the user. 'size' is the house as a whole. */
export type EditablePart = 'size' | 'roof' | 'frame' | 'cover' | 'vents' | 'door' | 'irrigation' | 'crop' | 'type';

export type ResizeKey = 'length' | 'width' | 'gutterHeight' | 'ridgeHeight';

/** A grip on the model. 'corner' changes length and width together. */
export type HandleKey = ResizeKey | 'corner';

/** Dragging snaps to whole metres for the footprint and half metres for heights. */
export const SNAP_STEP: Record<ResizeKey, number> = { length: 1, width: 1, gutterHeight: 0.5, ridgeHeight: 0.5 };

/** A gable or gothic roof must rise at least this much above the gutter. */
export const MIN_RISE = 0.5;

const snap = (value: number, step: number) => Math.round(value / step) * step;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Turns a dragged value into a config patch that always stays valid: snapped, inside the supported
 * limits, and with the roof rising above the gutter (or level with it for a flat roof).
 */
export function resizePatch(config: GreenhouseConfig, key: ResizeKey, rawValue: number): Partial<GreenhouseConfig> {
  if (!Number.isFinite(rawValue)) return {};
  const { min, max } = DIMENSION_LIMITS[key];
  const value = Number(clamp(snap(rawValue, SNAP_STEP[key]), min, max).toFixed(2));

  if (key === 'length' || key === 'width') return value === config[key] ? {} : { [key]: value };

  const flat = config.roofType === 'flat';
  const ridgeLimits = DIMENSION_LIMITS.ridgeHeight;
  const gutterLimits = DIMENSION_LIMITS.gutterHeight;

  if (key === 'gutterHeight') {
    if (flat) {
      // A flat roof has no rise, so both heights move together.
      const level = clamp(value, gutterLimits.min, Math.min(gutterLimits.max, ridgeLimits.max));
      return level === config.gutterHeight && level === config.ridgeHeight ? {} : { gutterHeight: level, ridgeHeight: level };
    }
    const ridgeHeight = Math.min(Math.max(config.ridgeHeight, value + MIN_RISE), ridgeLimits.max);
    const gutterHeight = Math.min(value, ridgeHeight - MIN_RISE);
    return gutterHeight === config.gutterHeight && ridgeHeight === config.ridgeHeight ? {} : { gutterHeight, ridgeHeight };
  }

  if (flat) return {}; // the ridge handle is not offered on a flat roof
  const ridgeHeight = Math.max(value, config.gutterHeight + MIN_RISE);
  return ridgeHeight === config.ridgeHeight ? {} : { ridgeHeight: Math.min(ridgeHeight, ridgeLimits.max) };
}

/** Switching to or from a shade-net house changes the cover, vents and door that go with it. */
export function typeCompatibilityPatch(
  nextType: GreenhouseConfig['greenhouseType'],
  config: GreenhouseConfig
): Partial<GreenhouseConfig> {
  if (nextType === 'shade-net') {
    return { greenhouseType: 'shade-net', coverMaterial: 'shade-net', sideVentilation: 'none', doorEntry: 'curtain' };
  }
  return {
    greenhouseType: nextType,
    coverMaterial: config.coverMaterial === 'shade-net' ? 'uv-polyfilm' : config.coverMaterial,
    sideVentilation: config.sideVentilation === 'none' ? 'manual-rollup' : config.sideVentilation,
    doorEntry: config.doorEntry === 'curtain' ? 'single-sliding' : config.doorEntry,
  };
}

/** Roof changes keep the heights consistent: flat levels the ridge, others restore a rise. */
export function roofPatch(roofType: GreenhouseConfig['roofType'], config: GreenhouseConfig): Partial<GreenhouseConfig> {
  if (roofType === 'flat') return { roofType, ridgeHeight: config.gutterHeight };
  const ridgeHeight =
    config.ridgeHeight > config.gutterHeight
      ? config.ridgeHeight
      : Math.min(config.gutterHeight + 2, DIMENSION_LIMITS.ridgeHeight.max);
  return { roofType, ridgeHeight };
}

/** The root group of the model; any hit inside it that names no other part selects the house. */
export const MODEL_ROOT_NAME = 'greenhouse-model';

/** Which part of the model a named scene object belongs to; null for anything not editable. */
export function partForObjectName(name: string): EditablePart | null {
  if (name === 'roof-cover') return 'roof';
  if (name === 'side-wall-cover' || name === 'end-wall-cover' || name === 'shade-net-structure') return 'cover';
  if (name === 'climate-equipment') return 'type';
  if (name.startsWith('frame-')) return 'frame';
  if (name.startsWith('vents-')) return 'vents';
  if (name.startsWith('door-')) return 'door';
  if (name.startsWith('irrigation-') || name.startsWith('pump-house-')) return 'irrigation';
  if (name.startsWith('crop-') || name === 'growing-beds') return 'crop';
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

/** True when a scene object is one of the named groups that make up a part (not the house root). */
export function objectBelongsToPart(name: string, part: EditablePart): boolean {
  if (name === MODEL_ROOT_NAME) return false;
  if (part === 'cover' && name === 'roof-cover') return true; // the cover is walls and roof
  return partForObjectName(name) === part;
}

export const PART_ORDER: EditablePart[] = ['size', 'roof', 'frame', 'cover', 'vents', 'door', 'irrigation', 'crop', 'type'];

/** The values each option-based part offers. Sizes are edited by dragging, not by choosing. */
export const PART_VALUES = {
  roof: ['flat', 'gable', 'gothic'],
  frame: ['gi-steel', 'aluminium', 'bamboo'],
  cover: ['uv-polyfilm', 'shade-net', 'insect-net', 'glass'],
  vents: SIDE_VENTILATION_OPTIONS.map((option) => option.value),
  door: DOOR_ENTRY_OPTIONS.map((option) => option.value),
  irrigation: IRRIGATION_SYSTEM_OPTIONS.map((option) => option.value),
  crop: CROP_OPTIONS.map((option) => option.value),
  type: ['naturally-ventilated', 'climate-controlled', 'shade-net'],
} as const;

export type OptionPart = Exclude<EditablePart, 'size'>;

/** The config field each option part sets. */
export const CONFIG_FIELD: Record<OptionPart, keyof GreenhouseConfig> = {
  roof: 'roofType',
  frame: 'structureMaterial',
  cover: 'coverMaterial',
  vents: 'sideVentilation',
  door: 'doorEntry',
  irrigation: 'irrigationSystem',
  crop: 'selectedCrop',
  type: 'greenhouseType',
};

/** A shade-net house has one fixed cover, no side vents and a curtain door. */
export const SHADE_LOCKED: Partial<Record<OptionPart, string>> = { cover: 'shade-net', vents: 'none', door: 'curtain' };

/** True when a value cannot be chosen for this house (the shade-net locks). */
export function isOptionLocked(part: OptionPart, value: string, config: GreenhouseConfig): boolean {
  const locked = SHADE_LOCKED[part];
  return config.greenhouseType === 'shade-net' && locked !== undefined && locked !== value;
}

/** The patch for choosing an option, including the knock-on changes some choices need. */
export function optionPatch(part: OptionPart, value: string, config: GreenhouseConfig): Partial<GreenhouseConfig> {
  if (part === 'roof') return roofPatch(value as GreenhouseConfig['roofType'], config);
  if (part === 'type') return typeCompatibilityPatch(value as GreenhouseConfig['greenhouseType'], config);
  return { [CONFIG_FIELD[part]]: value } as Partial<GreenhouseConfig>;
}

/**
 * The patch that steps a part to its next (or previous) available option, skipping locked ones and
 * wrapping around; empty when there is nothing else to choose.
 */
export function cycleOptionPatch(part: OptionPart, config: GreenhouseConfig, direction: 1 | -1): Partial<GreenhouseConfig> {
  const values = PART_VALUES[part] as readonly string[];
  const current = values.indexOf(String(config[CONFIG_FIELD[part]]));
  for (let step = 1; step < values.length; step += 1) {
    const index = (((current + direction * step) % values.length) + values.length) % values.length;
    const value = values[index];
    if (!isOptionLocked(part, value, config)) return optionPatch(part, value, config);
  }
  return {};
}

/** The camera view that shows a part best, when there is one. */
export const PART_FOCUS: Partial<Record<EditablePart, 'door' | 'vents' | 'irrigation' | 'climate'>> = {
  door: 'door',
  vents: 'vents',
  irrigation: 'irrigation',
  type: 'climate',
};

/** The grips a selected part offers. Parts chosen from a list (door, crop, ...) offer none. */
export function handlesForPart(part: EditablePart | null, config: Pick<GreenhouseConfig, 'roofType'>): HandleKey[] {
  const ridge: HandleKey[] = config.roofType === 'flat' ? [] : ['ridgeHeight'];
  if (part === 'size' || part === 'frame') return ['length', 'width', 'corner', 'gutterHeight', ...ridge];
  if (part === 'cover') return ['length', 'width', 'corner', 'gutterHeight'];
  if (part === 'roof') return ['gutterHeight', ...ridge];
  return [];
}

/** Distance between the walls and the grips that sit outside them. */
export const HANDLE_GAP = 1.4;
/** How far the ridge grip floats above the ridge. */
export const RIDGE_GAP = 0.7;

/**
 * Converts where the pointer is along a grip's axis (world metres, from the house centre) into the
 * dimension it controls. The house is centred, so moving one wall moves the opposite one too.
 */
export function handleValue(key: ResizeKey, coordinate: number): number {
  if (key === 'length' || key === 'width') return 2 * (coordinate - HANDLE_GAP);
  if (key === 'ridgeHeight') return coordinate - RIDGE_GAP;
  return coordinate;
}

/** The patch for a drag of the corner grip to (x, z) on the ground. */
export function cornerPatch(config: GreenhouseConfig, x: number, z: number): Partial<GreenhouseConfig> {
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

/** The i18n key naming each option value. */
export const OPTION_LABEL_KEYS: Record<string, string> = {
  flat: 'options.roof.flat',
  gable: 'options.roof.gable',
  gothic: 'options.roof.gothic',
  'gi-steel': 'options.structure.giSteel',
  aluminium: 'options.structure.aluminium',
  bamboo: 'options.structure.bamboo',
  'uv-polyfilm': 'options.cover.uvPolyfilm',
  'shade-net': 'options.cover.shadeNet',
  'insect-net': 'options.cover.insectNet',
  glass: 'options.cover.glass',
  none: 'options.sideVent.none',
  'manual-rollup': 'options.sideVent.manualRollup',
  'motorized-rollup': 'options.sideVent.motorizedRollup',
  louver: 'options.sideVent.louver',
  'single-sliding': 'options.door.singleSliding',
  'double-sliding': 'options.door.doubleSliding',
  'roll-up': 'options.door.rollUp',
  curtain: 'options.door.curtain',
  drip: 'options.irrigation.drip',
  sprinkler: 'options.irrigation.sprinkler',
  fogger: 'options.irrigation.fogger',
  'hydroponic-nft': 'options.irrigation.hydroponicNft',
  tomato: 'options.crop.tomato',
  capsicum: 'options.crop.capsicum',
  cucumber: 'options.crop.cucumber',
  lettuce: 'options.crop.lettuce',
  strawberry: 'options.crop.strawberry',
  gerbera: 'options.crop.gerbera',
  'naturally-ventilated': 'options.greenhouse.naturallyVentilated',
  'climate-controlled': 'options.greenhouse.climateControlled',
};

/** The i18n key for an option of a part (shade-net is a cover and a house type). */
export function optionLabelKey(part: OptionPart, value: string): string {
  if (part === 'type' && value === 'shade-net') return 'options.greenhouse.shadeNet';
  return OPTION_LABEL_KEYS[value] ?? value;
}

/**
 * Approximate area of cover film or net: both side walls, both end walls up to the gutter, the
 * gable triangles and the roof slopes (a gothic arch is about 6% longer than a straight slope).
 */
export function coverSurface(config: Pick<GreenhouseConfig, 'length' | 'width' | 'gutterHeight' | 'ridgeHeight' | 'roofType'>): number {
  const { length, width, gutterHeight, ridgeHeight, roofType } = config;
  const rise = Math.max(ridgeHeight - gutterHeight, 0);
  const walls = 2 * (length + width) * gutterHeight;
  if (roofType === 'flat') return walls + length * width;
  const slope = Math.hypot(width / 2, rise) * (roofType === 'gothic' ? 1.06 : 1);
  return walls + width * rise + 2 * slope * length;
}
