import indiaLocations from '../../shared/india-locations.json';
import poultryLimits from '../../shared/poultry-limits.json';
import type { BatchDates, PoultryAssumptions, PoultryReturns } from '@/lib/poultryFinance';
import {
  DEFAULT_POULTRY_CONFIG,
  type BeneficiaryCategory,
  type BirdType,
  type FarmingModel,
  type FeedingSystem,
  type FrameMaterial,
  type HousingSystem,
  type PoultryConfig,
  type RoofSheet,
  type ShedEntry,
  type ShedRoof,
  type SideWalls,
} from '@/types/poultry';

export type {
  BeneficiaryCategory,
  BirdType,
  FarmingModel,
  FeedingSystem,
  FrameMaterial,
  HousingSystem,
  RoofSheet,
  ShedEntry,
  ShedRoof,
  SideWalls,
} from '@/types/poultry';

/** The setup the planner works on: one poultry shed (src/types/poultry.ts). */
export type FarmConfig = PoultryConfig;

// Each option's label is the i18n key `options.<group>.<value>`; the first value is the default.
export const HOUSING_OPTIONS = [{ value: 'open-sided' }, { value: 'environment-controlled' }, { value: 'backyard' }] as const satisfies ReadonlyArray<{ value: HousingSystem }>;
export const ROOF_OPTIONS = [{ value: 'gable' }, { value: 'monitor' }, { value: 'lean-to' }] as const satisfies ReadonlyArray<{ value: ShedRoof }>;
export const FRAME_OPTIONS = [{ value: 'steel-truss' }, { value: 'rcc-pillars' }, { value: 'bamboo-wood' }] as const satisfies ReadonlyArray<{ value: FrameMaterial }>;
export const ROOF_SHEET_OPTIONS = [
  { value: 'gi-sheet' },
  { value: 'galvalume' },
  { value: 'fibre-cement' },
  { value: 'puf-panel' },
  { value: 'thatch' },
] as const satisfies ReadonlyArray<{ value: RoofSheet }>;
export const SIDE_WALL_OPTIONS = [{ value: 'mesh-curtain' }, { value: 'mesh-auto-curtain' }, { value: 'closed-tunnel' }] as const satisfies ReadonlyArray<{ value: SideWalls }>;
export const ENTRY_OPTIONS = [{ value: 'single-door' }, { value: 'door-footbath' }, { value: 'anteroom' }] as const satisfies ReadonlyArray<{ value: ShedEntry }>;
export const BIRD_OPTIONS = [{ value: 'broiler' }, { value: 'layer-cage' }, { value: 'layer-floor' }, { value: 'desi' }] as const satisfies ReadonlyArray<{ value: BirdType }>;
export const FEEDING_OPTIONS = [{ value: 'manual' }, { value: 'semi-auto' }, { value: 'automatic' }, { value: 'trough' }] as const satisfies ReadonlyArray<{ value: FeedingSystem }>;
export const FARMING_MODEL_OPTIONS = [{ value: 'independent' }, { value: 'contract' }] as const satisfies ReadonlyArray<{ value: FarmingModel }>;
export const CATEGORY_OPTIONS = [{ value: 'general' }, { value: 'sc-st' }] as const satisfies ReadonlyArray<{ value: BeneficiaryCategory }>;
export const CAGE_TIER_OPTIONS = [2, 3, 4] as const;

/** The i18n key of an option's label: `options.housing.environmentControlled` for 'environment-controlled'. */
export const optionKey = (group: string, value: string) => `options.${group}.${value.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`;

/** Which choices fit together; the backend validator says the same (backend/validators/poultryValidator.js). */
export const HOUSING_FOR_BIRD: Record<BirdType, HousingSystem[]> = {
  broiler: ['open-sided', 'environment-controlled'],
  'layer-cage': ['open-sided', 'environment-controlled'],
  'layer-floor': ['open-sided'],
  desi: ['backyard', 'open-sided'],
};
export const feedingFor = (birdType: BirdType): FeedingSystem[] =>
  birdType === 'layer-cage' ? ['trough', 'automatic'] : ['manual', 'semi-auto', 'automatic'];
export const isLayerBird = (birdType: BirdType) => birdType === 'layer-cage' || birdType === 'layer-floor';

// States, districts and dimension limits are shared with the backend so both
// sides offer and validate exactly the same values.
export const INDIAN_DISTRICTS: Record<string, string[]> = indiaLocations;

export const INDIAN_STATES: string[] = Object.keys(INDIAN_DISTRICTS);

export type DimensionKey = 'length' | 'width' | 'eavesHeight' | 'ridgeHeight';

export const DIMENSION_LIMITS: Record<DimensionKey, { min: number; max: number }> = {
  length: poultryLimits.length,
  width: poultryLimits.width,
  eavesHeight: poultryLimits.eavesHeight,
  ridgeHeight: poultryLimits.ridgeHeight,
};
export const STOCKING_DENSITY_LIMITS = poultryLimits.stockingDensity;
/** An open-sided shed wider than this ventilates poorly across its width. */
export const OPEN_SHED_MAX_WIDTH = poultryLimits.openShedMaxWidth;

export const DEFAULT_CONFIG: FarmConfig = DEFAULT_POULTRY_CONFIG;

/** Which sidebar sections are complete; the 3D view's checklist follows it. */
export interface SetupSectionProgress {
  size: boolean;
  shed: boolean;
  birds: boolean;
  location: boolean;
}

function pickOption<T extends string>(options: ReadonlyArray<{ value: T }>, value: unknown, fallback: T): T {
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
 * Builds a complete setup from partial or untrusted input (saved setups, share links, localStorage), keeping only
 * known fields, replacing invalid values with defaults, and making the choices a bird or shed type forces.
 */
export function normalizeFarmConfig(config?: Partial<FarmConfig> | null): FarmConfig {
  const input: Partial<Record<keyof FarmConfig, unknown>> = config ?? {};
  const d = DEFAULT_CONFIG;
  const density = input.stockingDensity === null || input.stockingDensity === undefined || input.stockingDensity === '' ? null : Number(input.stockingDensity);
  const tiers = Number(input.cageTiers);
  const next: FarmConfig = {
    length: pickNumber(input.length, d.length),
    width: pickNumber(input.width, d.width),
    eavesHeight: pickNumber(input.eavesHeight, d.eavesHeight),
    ridgeHeight: pickNumber(input.ridgeHeight, d.ridgeHeight),
    housingSystem: pickOption(HOUSING_OPTIONS, input.housingSystem, d.housingSystem),
    roofType: pickOption(ROOF_OPTIONS, input.roofType, d.roofType),
    frameMaterial: pickOption(FRAME_OPTIONS, input.frameMaterial, d.frameMaterial),
    roofSheet: pickOption(ROOF_SHEET_OPTIONS, input.roofSheet, d.roofSheet),
    sideWalls: pickOption(SIDE_WALL_OPTIONS, input.sideWalls, d.sideWalls),
    entry: pickOption(ENTRY_OPTIONS, input.entry, d.entry),
    birdType: pickOption(BIRD_OPTIONS, input.birdType, d.birdType),
    stockingDensity: density !== null && Number.isFinite(density) && density > 0 ? density : null,
    cageTiers: tiers === 2 || tiers === 4 ? tiers : 3,
    feedingSystem: pickOption(FEEDING_OPTIONS, input.feedingSystem, d.feedingSystem),
    farmingModel: pickOption(FARMING_MODEL_OPTIONS, input.farmingModel, d.farmingModel),
    beneficiaryCategory: pickOption(CATEGORY_OPTIONS, input.beneficiaryCategory, d.beneficiaryCategory),
    state: pickString(input.state, d.state),
    district: pickString(input.district, d.district),
  };
  return keepCompatible(next);
}

/**
 * The choices that follow from the bird and the shed, so every setup the sidebar produces is one the backend
 * accepts: a supported shed for the bird, troughs only for cages, closed walls only for a controlled shed, a bamboo
 * frame and thatch only for a backyard shed, and no contract farming for layers.
 */
export function keepCompatible(config: FarmConfig): FarmConfig {
  const next = { ...config };
  if (!HOUSING_FOR_BIRD[next.birdType].includes(next.housingSystem)) next.housingSystem = HOUSING_FOR_BIRD[next.birdType][0];
  const feeding = feedingFor(next.birdType);
  if (!feeding.includes(next.feedingSystem)) next.feedingSystem = feeding[0];
  if (isLayerBird(next.birdType)) next.farmingModel = 'independent';
  if (next.housingSystem === 'environment-controlled') next.sideWalls = 'closed-tunnel';
  else if (next.sideWalls === 'closed-tunnel') next.sideWalls = 'mesh-curtain';
  if (next.housingSystem === 'backyard') next.frameMaterial = 'bamboo-wood';
  else {
    if (next.frameMaterial === 'bamboo-wood') next.frameMaterial = 'steel-truss';
    if (next.roofSheet === 'thatch') next.roofSheet = 'gi-sheet';
  }
  return next;
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

/* ------------------------------ the server's answer (backend/services/poultry/calculator.js) ------------------------------ */

export interface SourceRef {
  document: string;
  url: string | null;
}

export interface FlockInfo {
  birds: number;
  product: 'meat' | 'eggs';
  sqftPerBird: number | null;
  normSqftPerBird: number | null;
}

export interface WorkingCapital {
  chicks: number;
  chickCost: number;
  feedCost: number;
  insuranceCost: number;
  vaccineCost: number;
  labourCost: number;
  total: number;
}

export interface ShedCost {
  civilCost: number;
  roofSheetCost: number;
  sideWallCost: number;
  entryCost: number;
  equipmentCost: number;
  feedStoreCost: number;
  fencingCost: number;
  waterSupplyCost: number;
  electricalCost: number;
  /** What a scheme or bank loan finances: the shed, equipment and fixed items. */
  capitalCost: number;
  /** The first batch's chicks, feed, insurance, vaccines and labour, as NABARD counts it. */
  workingCapital: WorkingCapital;
  projectCost: number;
  costPerBird: number;
  costPerSqft: number;
  /** Plus/minus band around capitalCost. */
  costRange: { low: number; high: number };
}

export interface NabardComparison {
  state: string;
  year: string;
  /** The unit's shed and farming model as NABARD names it ("Deep litter, contract farming"). */
  system: string;
  /** The project's state has no NABARD units yet; another state's stand in. */
  otherState: boolean;
  /** A contract unit (no chicks or feed): only the capital cost is compared. */
  capitalOnly: boolean;
  unitBirds: number;
  /** The state's booklet prints only a cost per bird, with no unit size (unitBirds is 1). */
  perBirdNorm?: boolean;
  unitCostInr: number;
  perBirdInr: number;
  normCostInr: number;
  ownCostInr: number;
  ratio: number | null;
  recognisedCostInr: number;
  note: string | null;
  source: SourceRef;
}

export type SchemeStatus = 'eligible' | 'check' | 'not-eligible';

export interface SchemeVerdict {
  id: string;
  name: string;
  status: SchemeStatus;
  reasons: string[];
  percent: number | null;
  capInr: number | null;
  amountInr: number;
  cappedAtInr: number | null;
  interestSubventionPct: number | null;
  verified: boolean;
  notes: string[];
  source: SourceRef;
}

export interface SchemesResult {
  schemes: SchemeVerdict[];
  /** Nothing to claim: the bank loan carries the project. */
  noneApplies: boolean;
  bestAmountInr: number;
}

export interface SitingRule {
  id: string;
  description: string;
  distanceM: number | null;
  appliesAboveBirds: number;
  appliesTo: string;
  source: SourceRef;
}

export interface HeatStress {
  basis: 'district' | 'state';
  threshold: number;
  thiByMonth: Array<{ month: string; thi: number }>;
  severeMonths: string[];
  advice: string[];
}

export interface ClimateData {
  climateZone: string;
  climateGroup: string;
  avgTemperature: number;
  humidity: number;
  rainfall: number;
  rainfallSource: 'district' | 'state';
  hottestMonthMeanC: number | null;
  heatStress: HeatStress | null;
  advisories: string[];
}

/** Official context the server attaches to a calculation; null when the database is unavailable. */
export interface ReferenceContext {
  districtClimate: {
    annualMeanTempC: number;
    annualHumidityPct: number;
    annualRainfallMm: number;
    hottestMonthMeanC: number;
    /** Highest hourly reading in the hottest month: an extreme, not a typical day. */
    hottestMonthMaxTempC: number;
    coldestMonthMinTempC: number;
    elevationM: number | null;
    source: string;
    note: string;
  } | null;
}

export interface CalculationResult {
  area: number;
  areaSqft: number;
  volume: number;
  flock: FlockInfo;
  cost: ShedCost;
  /** What the farmer finances: the project cost, or the capital cost alone under contract. */
  financedCost: number;
  nabard: NabardComparison | null;
  schemes: SchemesResult;
  siting: SitingRule[];
  climate: ClimateData;
  returns: PoultryReturns;
  calendar: BatchDates[];
  /** The assumptions the figures were worked out with (the defaults plus the user's edits). */
  assumptions: PoultryAssumptions;
  diagnostics: {
    areaSqft: number;
    roofSqm: number;
    envelopeFactor: number;
    shedInrPerSqft: number;
    equipmentInrPerBird: number;
    /** Chosen items whose price has no published source. */
    unsourcedRates: string[];
    notPriced: string[];
    label: string;
  };
  reference?: ReferenceContext | null;
}
