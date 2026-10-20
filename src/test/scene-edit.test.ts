import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DIMENSION_LIMITS, ROOF_SHEET_OPTIONS, type FarmConfig } from '@/types/farm';
import {
  HANDLE_GAP,
  MIN_RISE,
  PART_ORDER,
  PART_VALUES,
  cornerPatch,
  cycleOptionPatch,
  dragReadout,
  handleValue,
  handlesForPart,
  isOptionLocked,
  objectBelongsToPart,
  optionLabelKey,
  optionPatch,
  partForObject,
  partForObjectName,
  partLabelKey,
  resizePatch,
  roofSurface,
} from '@/lib/sceneEdit';
import { DESIGN_TABS } from '@/components/farm/DesignSidebar';

// The recommended shed: 14 x 7 m, 2.1 m to the eaves, 3.5 m at the ridge, open-sided, broilers.
const base: FarmConfig = { ...DEFAULT_CONFIG, state: 'Maharashtra', district: 'Nagpur' };
const apply = (config: FarmConfig, patch: Partial<FarmConfig>) => ({ ...config, ...patch });

describe('resizePatch', () => {
  it('snaps the footprint to half metres and heights to 10 cm, as the sidebar steps', () => {
    expect(resizePatch(base, 'length', 41.3)).toEqual({ length: 41.5 });
    expect(resizePatch(base, 'width', 8.8)).toEqual({ width: 9 });
    expect(resizePatch(base, 'eavesHeight', 2.34)).toEqual({ eavesHeight: 2.3, ridgeHeight: 3.5 });
    expect(resizePatch(base, 'ridgeHeight', 4.27)).toEqual({ ridgeHeight: 4.3 });
  });

  it('never leaves the supported limits, however far the handle is dragged', () => {
    for (const key of ['length', 'width', 'eavesHeight', 'ridgeHeight'] as const) {
      const { min, max } = DIMENSION_LIMITS[key];
      for (const raw of [-50, 0, min - 3, max + 3, 9999]) {
        const next = apply(base, resizePatch(base, key, raw));
        for (const dimension of ['length', 'width', 'eavesHeight', 'ridgeHeight'] as const) {
          expect(next[dimension], `${key} dragged to ${raw}`).toBeGreaterThanOrEqual(DIMENSION_LIMITS[dimension].min);
          expect(next[dimension], `${key} dragged to ${raw}`).toBeLessThanOrEqual(DIMENSION_LIMITS[dimension].max);
        }
      }
    }
  });

  it('keeps the ridge above the eaves, pushing it up when the eaves rise', () => {
    expect(resizePatch(base, 'eavesHeight', 3.4)).toEqual({ eavesHeight: 3.4, ridgeHeight: 3.9 });
    for (const roofType of ['gable', 'monitor', 'lean-to'] as const) {
      const config = { ...base, roofType };
      const raised = apply(config, resizePatch(config, 'eavesHeight', 9));
      expect(raised.ridgeHeight - raised.eavesHeight).toBeGreaterThanOrEqual(MIN_RISE - 1e-9);
      const lowered = apply(config, resizePatch(config, 'ridgeHeight', 1));
      expect(lowered.ridgeHeight - lowered.eavesHeight).toBeGreaterThanOrEqual(MIN_RISE - 1e-9);
    }
  });

  it('returns an empty patch when nothing changes, so a drag does not re-render the scene', () => {
    expect(resizePatch(base, 'length', 14.1)).toEqual({});
    expect(resizePatch(base, 'width', 7.2)).toEqual({});
    expect(resizePatch(base, 'ridgeHeight', 3.52)).toEqual({});
  });

  it('ignores a non-finite drag value', () => {
    expect(resizePatch(base, 'length', Number.NaN)).toEqual({});
  });
});

describe('parts', () => {
  it('are the design sidebar tabs without the location, so picking one opens the other', () => {
    expect(PART_ORDER).toEqual(DESIGN_TABS.filter((tab) => tab !== 'location'));
    expect(partLabelKey('roofSheet')).toBe('design.tab.roofSheet');
  });

  it('offer every value the sidebar offers, with its label', () => {
    expect(PART_VALUES.roofSheet).toEqual(ROOF_SHEET_OPTIONS.map((option) => option.value));
    expect(PART_VALUES.birds).toHaveLength(4);
    expect(optionLabelKey('birds', 'layer-cage')).toBe('options.bird.layerCage');
    expect(optionLabelKey('sideWalls', 'mesh-auto-curtain')).toBe('options.sideWalls.meshAutoCurtain');
  });
});

describe('option patches', () => {
  it('make the knock-on changes the setup needs (keepCompatible)', () => {
    expect(optionPatch('birds', 'layer-cage', base)).toEqual({ birdType: 'layer-cage', feedingSystem: 'trough' });
    expect(optionPatch('housing', 'environment-controlled', base)).toEqual({ housingSystem: 'environment-controlled', sideWalls: 'closed-tunnel' });
    expect(optionPatch('entry', 'anteroom', base)).toEqual({ entry: 'anteroom' });
    const desi = apply(base, optionPatch('birds', 'desi', base));
    expect(optionPatch('housing', 'backyard', desi)).toEqual({ housingSystem: 'backyard', frameMaterial: 'bamboo-wood' });
  });

  it('lock the choices that do not fit the bird or the shed', () => {
    expect(isOptionLocked('housing', 'backyard', base)).toBe(true);
    expect(isOptionLocked('sideWalls', 'closed-tunnel', base)).toBe(true);
    expect(isOptionLocked('frame', 'bamboo-wood', base)).toBe(true);
    expect(isOptionLocked('roofSheet', 'thatch', base)).toBe(true);
    expect(isOptionLocked('feeding', 'trough', base)).toBe(true);
    expect(isOptionLocked('roof', 'monitor', base)).toBe(false);
    const controlled = apply(base, optionPatch('housing', 'environment-controlled', base));
    expect(isOptionLocked('sideWalls', 'mesh-curtain', controlled)).toBe(true);
  });

  it('cycle to the next available option, skipping locked ones and wrapping around', () => {
    expect(cycleOptionPatch('roof', base, 1)).toEqual({ roofType: 'monitor' });
    expect(cycleOptionPatch('roof', base, -1)).toEqual({ roofType: 'lean-to' });
    expect(cycleOptionPatch('frame', base, -1)).toEqual({ frameMaterial: 'rcc-pillars' });
    const auto = { ...base, sideWalls: 'mesh-auto-curtain' as const };
    expect(cycleOptionPatch('sideWalls', auto, 1)).toEqual({ sideWalls: 'mesh-curtain' });
  });
});

describe('part detection', () => {
  const node = (name: string, parent: unknown = null) => ({ name, parent });

  it('maps the named groups in the model to the part they edit', () => {
    expect(partForObjectName('roof-sheet')).toBe('roof');
    expect(partForObjectName('roof-vent')).toBe('roof');
    expect(partForObjectName('frame-posts')).toBe('frame');
    expect(partForObjectName('walls-curtains')).toBe('sideWalls');
    expect(partForObjectName('tunnel-fans')).toBe('housing');
    expect(partForObjectName('entry-footbath')).toBe('entry');
    expect(partForObjectName('birds-flock')).toBe('birds');
    expect(partForObjectName('cages-rows')).toBe('birds');
    expect(partForObjectName('litter')).toBe('birds');
    expect(partForObjectName('feeding-silo')).toBe('feeding');
    expect(partForObjectName('farm-model')).toBe('size');
    expect(partForObjectName('site-tank')).toBeNull();
  });

  it('finds the part from any mesh inside it', () => {
    const entry = node('entry-model', node('farm-model'));
    const panel = node('', node('entry-door', entry));
    expect(partForObject(panel)).toBe('entry');
    // Anything else inside the model (the plinth, the water tank) selects the shed as a whole.
    expect(partForObject(node('site-tank', node('farm-model')))).toBe('size');
    expect(partForObject(node('grass'))).toBeNull();
    expect(partForObject(null)).toBeNull();
  });

  it('collects the groups that make up a part for its selection outline', () => {
    expect(objectBelongsToPart('roof-model', 'roof')).toBe(true);
    expect(objectBelongsToPart('roof-sheet', 'roofSheet')).toBe(true);
    expect(objectBelongsToPart('roof-ridge', 'roofSheet')).toBe(false);
    expect(objectBelongsToPart('walls-model', 'housing')).toBe(true);
    expect(objectBelongsToPart('tunnel-equipment', 'housing')).toBe(true);
    expect(objectBelongsToPart('farm-model', 'size')).toBe(false);
    expect(objectBelongsToPart('entry-model', 'sideWalls')).toBe(false);
  });
});

describe('grips', () => {
  it('offers resize grips on the shed, frame and walls, height grips on the roof, none on listed parts', () => {
    expect(handlesForPart('size')).toEqual(['length', 'width', 'corner', 'eavesHeight', 'ridgeHeight']);
    expect(handlesForPart('roof')).toEqual(['eavesHeight', 'ridgeHeight']);
    expect(handlesForPart('roofSheet')).toEqual(['eavesHeight', 'ridgeHeight']);
    expect(handlesForPart('sideWalls')).not.toContain('ridgeHeight');
    expect(handlesForPart('entry')).toEqual([]);
    expect(handlesForPart('birds')).toEqual([]);
    expect(handlesForPart(null)).toEqual([]);
  });

  it('turns a grip position back into the dimension it controls', () => {
    expect(handleValue('length', 7 + HANDLE_GAP)).toBeCloseTo(14, 9);
    expect(handleValue('width', 3.5 + HANDLE_GAP)).toBeCloseTo(7, 9);
    expect(handleValue('eavesHeight', 2.4)).toBe(2.4);
  });

  it('resizes both footprint sides from the corner grip', () => {
    expect(cornerPatch(base, 4 + HANDLE_GAP, 10 + HANDLE_GAP)).toEqual({ width: 8, length: 20 });
    expect(cornerPatch(base, 3.5 + HANDLE_GAP, 7 + HANDLE_GAP)).toEqual({});
  });

  it('describes a drag the way Blender does in its header', () => {
    expect(dragReadout('Length', 32, 28)).toBe('Length 32 m (+4)');
    expect(dragReadout('Eaves', 2.1, 2.4)).toBe('Eaves 2.1 m (−0.3)');
    expect(dragReadout('Width', 10, 10)).toBe('Width 10 m (±0)');
  });
});

describe('roofSurface', () => {
  it('measures both slopes with the overhang, one slope for a lean-to', () => {
    const gable = roofSurface(base);
    expect(gable).toBeCloseTo(2 * Math.hypot(3.5 + 1.07, 1.4) * 14, 6);
    expect(roofSurface({ ...base, roofType: 'lean-to' })).toBeCloseTo(Math.hypot(7 + 2.14, 1.4) * 14, 6);
    expect(roofSurface({ ...base, roofType: 'monitor' })).toBeGreaterThan(gable);
  });
});
