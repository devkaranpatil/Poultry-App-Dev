import norms from '../../shared/poultry-norms.json';

/**
 * The poultry setup the planner moves to (docs/migration/feature-changes.md, section 1). The screens still
 * use FarmConfig (the polyhouse fields) until Phases 3 and 4 switch them over; these types and the norms
 * behind them are ready first so the calculations can be built and tested against them.
 */

export type BirdType = 'broiler' | 'layer-cage' | 'layer-floor' | 'desi';
export type HousingSystem = 'open-sided' | 'environment-controlled' | 'backyard';
export type ShedRoof = 'gable' | 'monitor' | 'lean-to';
export type FrameMaterial = 'steel-truss' | 'rcc-pillars' | 'bamboo-wood';
export type RoofSheet = 'gi-sheet' | 'galvalume' | 'fibre-cement' | 'puf-panel' | 'thatch';
export type SideWalls = 'mesh-curtain' | 'mesh-auto-curtain' | 'closed-tunnel';
export type ShedEntry = 'single-door' | 'door-footbath' | 'anteroom';
export type FeedingSystem = 'manual' | 'semi-auto' | 'automatic' | 'trough';
/** Independent: the farmer buys inputs and sells at market. Contract: an integrator supplies inputs and pays a growing charge. */
export type FarmingModel = 'independent' | 'contract';
export type BeneficiaryCategory = 'general' | 'sc-st';

export interface PoultryConfig {
  length: number;
  width: number;
  eavesHeight: number;
  ridgeHeight: number;
  housingSystem: HousingSystem;
  roofType: ShedRoof;
  frameMaterial: FrameMaterial;
  roofSheet: RoofSheet;
  sideWalls: SideWalls;
  entry: ShedEntry;
  birdType: BirdType;
  /** Sq ft per bird; null uses the norm for the bird and shed (shared/poultry-norms.json). */
  stockingDensity: number | null;
  /** Tiers of cages for layers in cages (shown in 3D; the cage cost is per bird). */
  cageTiers: 2 | 3 | 4;
  feedingSystem: FeedingSystem;
  farmingModel: FarmingModel;
  beneficiaryCategory: BeneficiaryCategory;
  state: string;
  district: string;
}

export const BIRD_TYPES = Object.keys(norms.birdTypes) as BirdType[];
export const HOUSING_SYSTEMS = Object.keys(norms.housingSystems) as HousingSystem[];

/**
 * An open-sided broiler shed near NABARD's 1,000-bird unit: 7 m wide (open houses are 22 to 25 ft, IS 2732 /
 * TNAU), 2.1 m to the eaves and 3.5 m at the ridge (6 to 7 ft and 10 to 12 ft).
 */
export const DEFAULT_POULTRY_CONFIG: PoultryConfig = {
  length: 14,
  width: 7,
  eavesHeight: 2.1,
  ridgeHeight: 3.5,
  housingSystem: 'open-sided',
  roofType: 'gable',
  frameMaterial: 'steel-truss',
  roofSheet: 'gi-sheet',
  sideWalls: 'mesh-curtain',
  entry: 'door-footbath',
  birdType: 'broiler',
  stockingDensity: null,
  cageTiers: 3,
  feedingSystem: 'manual',
  farmingModel: 'independent',
  beneficiaryCategory: 'general',
  state: '',
  district: '',
};
