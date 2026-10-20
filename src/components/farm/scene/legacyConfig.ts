import sceneLimits from '../../../../shared/farm-limits.json';
import type { FarmConfig as ShedConfig } from '@/types/farm';
import type { DesignTab } from '@/components/farm/DesignSidebar';

/**
 * TEMPORARY (Phase 4 to Phase 5 of docs/migration/implementation-plan.md): the 3D scene still draws the polyhouse it
 * was built for and reads the polyhouse fields below. The screens use the poultry setup (src/types/farm.ts), and
 * toSceneConfig / fromScenePatch translate at the scene's edge. Phase 5 rebuilds the scene for sheds and deletes
 * this file.
 */

export type GreenhouseType =
  | 'naturally-ventilated'
  | 'climate-controlled'
  | 'shade-net';

export type RoofType = 'flat' | 'gable' | 'gothic';

export type StructureMaterial = 'gi-steel' | 'aluminium' | 'bamboo';

export type CoverMaterial = 'uv-polyfilm' | 'shade-net' | 'insect-net' | 'glass';

export type SideVentilation = 'none' | 'manual-rollup' | 'motorized-rollup' | 'louver';

export type DoorEntry = 'single-sliding' | 'double-sliding' | 'roll-up' | 'curtain';

export type CropType =
  | 'tomato'
  | 'capsicum'
  | 'cucumber'
  | 'lettuce'
  | 'strawberry'
  | 'gerbera';

export type IrrigationSystem =
  | 'drip'
  | 'sprinkler'
  | 'fogger'
  | 'hydroponic-nft';

export interface FarmConfig {
  // Base Dimensions
  length: number;
  width: number;
  
  // Height Configuration
  gutterHeight: number;
  ridgeHeight: number;
  
  // Greenhouse Type
  greenhouseType: GreenhouseType;
  
  // Roof Geometry
  roofType: RoofType;
  
  // Materials
  structureMaterial: StructureMaterial;
  coverMaterial: CoverMaterial;
  
  // Ventilation & Access
  sideVentilation: SideVentilation;
  doorEntry: DoorEntry;

  // Cultivation & Utilities
  selectedCrop: CropType;
  irrigationSystem: IrrigationSystem;
  
  // Location & Climate
  state: string;
  district: string;
}

export interface SetupSectionProgress {
  baseDimensions: boolean;
  heights: boolean;
  typeAndRoof: boolean;
  materials: boolean;
  access: boolean;
  cultivation: boolean;
  location: boolean;
}

export const GREENHOUSE_TYPES = [
  { value: 'naturally-ventilated', label: 'Naturally Ventilated', description: 'Uses natural wind for cooling' },
  { value: 'climate-controlled', label: 'Climate Controlled', description: 'Fans and pads for precision' },
  { value: 'shade-net', label: 'Shade Net', description: 'Basic protection from sunlight' },
] as const;

export const ROOF_TYPES = [
  { value: 'flat', label: 'Flat', description: 'Simple & low-cost' },
  { value: 'gable', label: 'Gable', description: 'Traditional A-shape' },
  { value: 'gothic', label: 'Gothic', description: 'Best for snow/rain' },
] as const;

export const STRUCTURE_MATERIALS = [
  { value: 'gi-steel', label: 'GI Steel' },
  { value: 'aluminium', label: 'Aluminium' },
  { value: 'bamboo', label: 'Bamboo' },
] as const;

export const COVER_MATERIALS = [
  { value: 'uv-polyfilm', label: 'UV Polyfilm' },
  { value: 'shade-net', label: 'Shade Net' },
  { value: 'insect-net', label: 'Insect Net' },
  { value: 'glass', label: 'Glass Panels' },
] as const;

export const SIDE_VENTILATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'manual-rollup', label: 'Manual Roll-up' },
  { value: 'motorized-rollup', label: 'Motorized Roll-up' },
  { value: 'louver', label: 'Louver Vents' },
] as const;

export const DOOR_ENTRY_OPTIONS = [
  { value: 'single-sliding', label: 'Single Sliding Door' },
  { value: 'double-sliding', label: 'Double Sliding Door' },
  { value: 'roll-up', label: 'Roll-up Door' },
  { value: 'curtain', label: 'Curtain Entry' },
] as const;

export const CROP_OPTIONS = [
  { value: 'tomato', label: 'Tomato', category: 'Vegetable' },
  { value: 'capsicum', label: 'Capsicum', category: 'Vegetable' },
  { value: 'cucumber', label: 'Cucumber', category: 'Vegetable' },
  { value: 'lettuce', label: 'Lettuce', category: 'Leafy' },
  { value: 'strawberry', label: 'Strawberry', category: 'Berry' },
  { value: 'gerbera', label: 'Gerbera', category: 'Flower' },
] as const;

export const IRRIGATION_SYSTEM_OPTIONS = [
  { value: 'drip', label: 'Drip Irrigation', description: 'Efficient baseline for row crops' },
  { value: 'sprinkler', label: 'Sprinkler Grid', description: 'Balanced coverage for mixed beds' },
  { value: 'fogger', label: 'Fogger + Mist', description: 'Supports humidity-sensitive crops' },
  { value: 'hydroponic-nft', label: 'Hydroponic NFT', description: 'Premium recirculating setup' },
] as const;

export type DimensionKey = 'length' | 'width' | 'gutterHeight' | 'ridgeHeight';

export const DIMENSION_LIMITS: Record<DimensionKey, { min: number; max: number }> = sceneLimits;

export const DEFAULT_CONFIG: FarmConfig = {
  length: 30,
  width: 10,
  gutterHeight: 4,
  ridgeHeight: 6,
  greenhouseType: 'naturally-ventilated',
  roofType: 'gable',
  structureMaterial: 'gi-steel',
  coverMaterial: 'uv-polyfilm',
  sideVentilation: 'manual-rollup',
  doorEntry: 'single-sliding',
  selectedCrop: 'tomato',
  irrigationSystem: 'drip',
  state: "",
  district: "",
};

function pickOption<T extends string>(
  options: ReadonlyArray<{ value: T }>,
  value: unknown,
  fallback: T
): T {
  return options.some((option) => option.value === value) ? (value as T) : fallback;
}

function pickNumber(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Builds a complete config from partial or untrusted input (saved setups,
 * localStorage), keeping only known fields and replacing invalid values with
 * defaults.
 */
export function normalizeFarmConfig(
  config?: Partial<FarmConfig> | null
): FarmConfig {
  const input: Partial<Record<keyof FarmConfig, unknown>> = config ?? {};
  return {
    length: pickNumber(input.length, DEFAULT_CONFIG.length),
    width: pickNumber(input.width, DEFAULT_CONFIG.width),
    gutterHeight: pickNumber(input.gutterHeight, DEFAULT_CONFIG.gutterHeight),
    ridgeHeight: pickNumber(input.ridgeHeight, DEFAULT_CONFIG.ridgeHeight),
    greenhouseType: pickOption(GREENHOUSE_TYPES, input.greenhouseType, DEFAULT_CONFIG.greenhouseType),
    roofType: pickOption(ROOF_TYPES, input.roofType, DEFAULT_CONFIG.roofType),
    structureMaterial: pickOption(STRUCTURE_MATERIALS, input.structureMaterial, DEFAULT_CONFIG.structureMaterial),
    coverMaterial: pickOption(COVER_MATERIALS, input.coverMaterial, DEFAULT_CONFIG.coverMaterial),
    sideVentilation: pickOption(SIDE_VENTILATION_OPTIONS, input.sideVentilation, DEFAULT_CONFIG.sideVentilation),
    doorEntry: pickOption(DOOR_ENTRY_OPTIONS, input.doorEntry, DEFAULT_CONFIG.doorEntry),
    selectedCrop: pickOption(CROP_OPTIONS, input.selectedCrop, DEFAULT_CONFIG.selectedCrop),
    irrigationSystem: pickOption(IRRIGATION_SYSTEM_OPTIONS, input.irrigationSystem, DEFAULT_CONFIG.irrigationSystem),
    state: pickString(input.state, DEFAULT_CONFIG.state),
    district: pickString(input.district, DEFAULT_CONFIG.district),
  };
}

export function isWithinDimensionLimits(key: DimensionKey, value: number): boolean {
  const { min, max } = DIMENSION_LIMITS[key];
  return value >= min && value <= max;
}

/** Keeps the 3D model renderable while the user is still typing an out-of-range value. */
export function clampDimension(key: DimensionKey, value: number): number {
  const { max } = DIMENSION_LIMITS[key];
  return Math.min(Math.max(value, 0), max);
}

/** The polyhouse setup the current scene draws for a poultry shed: the same size, the nearest shapes. */
export function toSceneConfig(shed: ShedConfig): FarmConfig {
  return {
    length: shed.length,
    width: shed.width,
    gutterHeight: shed.eavesHeight,
    ridgeHeight: shed.ridgeHeight,
    greenhouseType: shed.housingSystem === 'environment-controlled' ? 'climate-controlled' : 'naturally-ventilated',
    roofType: 'gable',
    structureMaterial: shed.frameMaterial === 'bamboo-wood' ? 'bamboo' : 'gi-steel',
    coverMaterial: 'uv-polyfilm',
    sideVentilation: shed.sideWalls === 'closed-tunnel' ? 'none' : shed.sideWalls === 'mesh-auto-curtain' ? 'motorized-rollup' : 'manual-rollup',
    doorEntry: shed.entry === 'anteroom' ? 'double-sliding' : 'single-sliding',
    selectedCrop: 'lettuce',
    irrigationSystem: 'drip',
    state: shed.state,
    district: shed.district,
  };
}

/** What a drag in the scene changes in the poultry setup: its size and heights; the shapes come from the sidebar. */
export function fromScenePatch(patch: Partial<FarmConfig>): Partial<ShedConfig> {
  const out: Partial<ShedConfig> = {};
  if (patch.length !== undefined) out.length = patch.length;
  if (patch.width !== undefined) out.width = patch.width;
  if (patch.gutterHeight !== undefined) out.eavesHeight = patch.gutterHeight;
  if (patch.ridgeHeight !== undefined) out.ridgeHeight = patch.ridgeHeight;
  return out;
}

/** The scene's parts and the sidebar's tabs name the same things differently until Phase 5. */
const TAB_FOR_PART: Record<string, DesignTab> = {
  size: 'size',
  type: 'housing',
  roof: 'roof',
  frame: 'frame',
  cover: 'roofSheet',
  vents: 'sideWalls',
  door: 'entry',
  crop: 'birds',
  irrigation: 'feeding',
};

export const tabForPart = (part: string): DesignTab => TAB_FOR_PART[part] ?? 'size';
export const partForTab = (tab: DesignTab): string | null =>
  tab === 'location' ? null : (Object.keys(TAB_FOR_PART).find((part) => TAB_FOR_PART[part] === tab) ?? null);
