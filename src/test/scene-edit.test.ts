import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DIMENSION_LIMITS, type FarmConfig } from '@/types/farm';
import {
  HANDLE_GAP,
  MIN_RISE,
  PART_VALUES,
  cornerPatch,
  cycleOptionPatch,
  dragReadout,
  handleValue,
  handlesForPart,
  isOptionLocked,
  objectBelongsToPart,
  optionPatch,
  partForObject,
  partForObjectName,
  resizePatch,
  roofPatch,
  typeCompatibilityPatch,
} from '@/lib/sceneEdit';

const base: FarmConfig = { ...DEFAULT_CONFIG, state: 'Goa', district: 'North Goa' };
const apply = (config: FarmConfig, patch: Partial<FarmConfig>) => ({ ...config, ...patch });

describe('resizePatch', () => {
  it('snaps the footprint to whole metres and heights to half metres', () => {
    expect(resizePatch(base, 'length', 41.4)).toEqual({ length: 41 });
    expect(resizePatch(base, 'width', 12.6)).toEqual({ width: 13 });
    expect(resizePatch(base, 'gutterHeight', 4.8)).toEqual({ gutterHeight: 5, ridgeHeight: 6 });
    expect(resizePatch(base, 'ridgeHeight', 7.3)).toEqual({ ridgeHeight: 7.5 });
  });

  it('never leaves the supported limits, however far the handle is dragged', () => {
    for (const key of ['length', 'width', 'gutterHeight', 'ridgeHeight'] as const) {
      const { min, max } = DIMENSION_LIMITS[key];
      for (const raw of [-50, 0, min - 3, max + 3, 9999]) {
        const next = apply(base, resizePatch(base, key, raw));
        for (const dimension of ['length', 'width', 'gutterHeight', 'ridgeHeight'] as const) {
          expect(next[dimension], `${key} dragged to ${raw}`).toBeGreaterThanOrEqual(DIMENSION_LIMITS[dimension].min);
          expect(next[dimension], `${key} dragged to ${raw}`).toBeLessThanOrEqual(DIMENSION_LIMITS[dimension].max);
        }
      }
    }
  });

  it('keeps the roof above the gutter on a gable or gothic roof', () => {
    for (const roofType of ['gable', 'gothic'] as const) {
      const config = { ...base, roofType };
      const raisedGutter = apply(config, resizePatch(config, 'gutterHeight', 8));
      expect(raisedGutter.ridgeHeight - raisedGutter.gutterHeight).toBeGreaterThanOrEqual(MIN_RISE);
      const loweredRidge = apply(config, resizePatch(config, 'ridgeHeight', 3));
      expect(loweredRidge.ridgeHeight - loweredRidge.gutterHeight).toBeGreaterThanOrEqual(MIN_RISE);
    }
  });

  it('moves both heights together on a flat roof and offers no separate ridge', () => {
    const flat = { ...base, roofType: 'flat' as const, ridgeHeight: 4 };
    expect(resizePatch(flat, 'gutterHeight', 5)).toEqual({ gutterHeight: 5, ridgeHeight: 5 });
    expect(resizePatch(flat, 'ridgeHeight', 7)).toEqual({});
  });

  it('returns an empty patch when nothing changes, so a drag does not re-render the scene', () => {
    expect(resizePatch(base, 'length', 30.2)).toEqual({});
    expect(resizePatch(base, 'ridgeHeight', 6.1)).toEqual({});
  });

  it('ignores a non-finite drag value', () => {
    expect(resizePatch(base, 'length', Number.NaN)).toEqual({});
  });
});

describe('option patches', () => {
  it('locks cover, vents and door when switching to a shade-net house, and restores sensible ones after', () => {
    const shade = apply(base, typeCompatibilityPatch('shade-net', base));
    expect(shade).toMatchObject({ greenhouseType: 'shade-net', coverMaterial: 'shade-net', sideVentilation: 'none', doorEntry: 'curtain' });
    const back = apply(shade, typeCompatibilityPatch('naturally-ventilated', shade));
    expect(back).toMatchObject({ coverMaterial: 'uv-polyfilm', sideVentilation: 'manual-rollup', doorEntry: 'single-sliding' });
  });

  it('keeps the user choices when switching between covered types', () => {
    const custom = { ...base, coverMaterial: 'glass' as const, sideVentilation: 'louver' as const };
    expect(apply(custom, typeCompatibilityPatch('climate-controlled', custom))).toMatchObject({
      coverMaterial: 'glass',
      sideVentilation: 'louver',
    });
  });

  it('levels the ridge for a flat roof and restores a rise afterwards', () => {
    const flat = apply(base, roofPatch('flat', base));
    expect(flat.ridgeHeight).toBe(flat.gutterHeight);
    const gable = apply(flat, roofPatch('gable', flat));
    expect(gable.ridgeHeight).toBeGreaterThan(gable.gutterHeight);
  });

  it('offers every value the form offers', () => {
    expect(PART_VALUES.crop).toHaveLength(6);
    expect(PART_VALUES.irrigation).toHaveLength(4);
    expect(PART_VALUES.vents).toHaveLength(4);
    expect(PART_VALUES.door).toHaveLength(4);
  });
});

describe('part detection', () => {
  const node = (name: string, parent: unknown = null) => ({ name, parent });

  it('maps the named groups in the model to the part they edit', () => {
    expect(partForObjectName('roof-cover')).toBe('roof');
    expect(partForObjectName('side-wall-cover')).toBe('cover');
    expect(partForObjectName('vents-louver')).toBe('vents');
    expect(partForObjectName('door-roll-up')).toBe('door');
    expect(partForObjectName('irrigation-drip')).toBe('irrigation');
    expect(partForObjectName('pump-house-fogger')).toBe('irrigation');
    expect(partForObjectName('crop-tomato')).toBe('crop');
    expect(partForObjectName('climate-equipment')).toBe('type');
    expect(partForObjectName('frame-hoops')).toBe('frame');
    expect(partForObjectName('frame-purlins')).toBe('frame');
    expect(partForObjectName('farm-model')).toBe('size');
    expect(partForObjectName('louver-slat')).toBeNull();
  });

  it('finds the part from any mesh inside it', () => {
    const door = node('door-single-sliding', node('farm-model'));
    const panel = node('panel', node('track', door));
    expect(partForObject(panel)).toBe('door');
    // Anything else inside the model (the foundation, a gutter) selects the house as a whole.
    expect(partForObject(node('mystery', node('farm-model')))).toBe('size');
    expect(partForObject(node('grass'))).toBeNull();
    expect(partForObject(null)).toBeNull();
  });

  it('collects the groups that make up a part for its selection outline', () => {
    expect(objectBelongsToPart('frame-arches', 'frame')).toBe(true);
    expect(objectBelongsToPart('roof-cover', 'roof')).toBe(true);
    expect(objectBelongsToPart('roof-cover', 'cover')).toBe(true);
    expect(objectBelongsToPart('end-wall-cover', 'cover')).toBe(true);
    expect(objectBelongsToPart('farm-model', 'size')).toBe(false);
    expect(objectBelongsToPart('door-roll-up', 'vents')).toBe(false);
  });
});

describe('grips', () => {
  it('offers resize grips on the house, cover and frame, height grips on the roof, none on listed parts', () => {
    expect(handlesForPart('size', base)).toEqual(['length', 'width', 'corner', 'gutterHeight', 'ridgeHeight']);
    expect(handlesForPart('roof', base)).toEqual(['gutterHeight', 'ridgeHeight']);
    expect(handlesForPart('roof', { roofType: 'flat' })).toEqual(['gutterHeight']);
    expect(handlesForPart('cover', base)).not.toContain('ridgeHeight');
    expect(handlesForPart('door', base)).toEqual([]);
    expect(handlesForPart(null, base)).toEqual([]);
  });

  it('turns a grip position back into the dimension it controls', () => {
    expect(handleValue('length', 15 + HANDLE_GAP)).toBeCloseTo(30, 9);
    expect(handleValue('width', 7 + HANDLE_GAP)).toBeCloseTo(14, 9);
    expect(handleValue('gutterHeight', 4.5)).toBe(4.5);
  });

  it('resizes both footprint sides from the corner grip', () => {
    expect(cornerPatch(base, 6 + HANDLE_GAP, 20 + HANDLE_GAP)).toEqual({ width: 12, length: 40 });
    expect(cornerPatch(base, 5 + HANDLE_GAP, 15 + HANDLE_GAP)).toEqual({});
  });

  it('describes a drag the way Blender does in its header', () => {
    expect(dragReadout('Length', 32, 28)).toBe('Length 32 m (+4)');
    expect(dragReadout('Gutter', 3.5, 4)).toBe('Gutter 3.5 m (−0.5)');
    expect(dragReadout('Width', 10, 10)).toBe('Width 10 m (±0)');
  });
});

describe('choosing options in the properties panel', () => {
  it('cycles to the next option and wraps around', () => {
    expect(cycleOptionPatch('crop', { ...base, selectedCrop: 'tomato' }, 1)).toEqual({ selectedCrop: 'capsicum' });
    expect(cycleOptionPatch('crop', { ...base, selectedCrop: 'tomato' }, -1)).toEqual({ selectedCrop: 'gerbera' });
  });

  it('skips options a shade-net house cannot have', () => {
    const shade = apply(base, typeCompatibilityPatch('shade-net', base));
    expect(isOptionLocked('cover', 'glass', shade)).toBe(true);
    expect(isOptionLocked('cover', 'shade-net', shade)).toBe(false);
    expect(cycleOptionPatch('cover', shade, 1)).toEqual({});
    expect(cycleOptionPatch('frame', shade, 1)).toEqual({ structureMaterial: 'aluminium' });
  });

  it('keeps the knock-on changes of roof and house type choices', () => {
    expect(optionPatch('roof', 'flat', base)).toEqual({ roofType: 'flat', ridgeHeight: base.gutterHeight });
    expect(optionPatch('type', 'shade-net', base)).toMatchObject({ coverMaterial: 'shade-net' });
    expect(optionPatch('door', 'roll-up', base)).toEqual({ doorEntry: 'roll-up' });
  });
});
