import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validateFarmConfig } = require('../../backend/validators/farmValidator.js');

const validBaseConfig = {
  length: 30,
  width: 10,
  gutterHeight: 4,
  ridgeHeight: 6,
  greenhouseType: 'naturally-ventilated',
  roofType: 'gable',
  structureMaterial: 'galvanized_iron',
  coverMaterial: 'uv_polyfilm',
  sideVentilation: 'manual-rollup',
  doorType: 'single-sliding',
  selectedCrop: 'tomato',
  irrigationSystem: 'drip',
  stateName: 'Goa',
  district: 'North Goa',
};

describe('greenhouse validator', () => {
  it('accepts district names with numbers', () => {
    const errors = validateFarmConfig({
      ...validBaseConfig,
      stateName: 'West Bengal',
      district: 'North 24 Parganas',
    });

    expect(errors.district).toBeUndefined();
  });

  it('rejects invalid state names with digits', () => {
    const errors = validateFarmConfig({
      ...validBaseConfig,
      stateName: 'Goa123',
    });

    expect(errors.stateName).toBeDefined();
  });

  it('enforces flat-roof ridge/gutter equality', () => {
    const errors = validateFarmConfig({
      ...validBaseConfig,
      roofType: 'flat',
      gutterHeight: 4,
      ridgeHeight: 5,
    });

    expect(errors.heightLogic).toContain('flat roof');
  });

  it('enforces shade-net compatibility rules', () => {
    const errors = validateFarmConfig({
      ...validBaseConfig,
      greenhouseType: 'shade-net',
      coverMaterial: 'uv_polyfilm',
      sideVentilation: 'manual-rollup',
      doorType: 'single-sliding',
    });

    expect(errors.coverMaterial).toBeDefined();
    expect(errors.sideVentilation).toBeDefined();
    expect(errors.doorType).toBeDefined();
  });

  it('rejects invalid cultivation selections', () => {
    const errors = validateFarmConfig({
      ...validBaseConfig,
      selectedCrop: 'banana',
      irrigationSystem: 'flood',
    });

    expect(errors.selectedCrop).toBeDefined();
    expect(errors.irrigationSystem).toBeDefined();
  });

  it('accepts the baseline configuration', () => {
    expect(validateFarmConfig(validBaseConfig)).toEqual({});
  });

  it('rejects dimensions outside the shared limits', () => {
    const errors = validateFarmConfig({
      ...validBaseConfig,
      length: 100000,
      width: 2,
      gutterHeight: 9,
      ridgeHeight: 20,
    });

    expect(errors.length).toContain('between 5 and 200');
    expect(errors.width).toContain('between 5 and 100');
    expect(errors.gutterHeight).toContain('between 2 and 8');
    expect(errors.ridgeHeight).toContain('between 3 and 12');
  });

  it('applies only the gutter range to flat roofs', () => {
    const errors = validateFarmConfig({
      ...validBaseConfig,
      roofType: 'flat',
      gutterHeight: 2.5,
      ridgeHeight: 2.5,
    });

    expect(errors).toEqual({});
  });

  it('rejects unknown dropdown values', () => {
    const errors = validateFarmConfig({
      ...validBaseConfig,
      greenhouseType: 'igloo',
      roofType: 'dome',
      structureMaterial: 'titanium',
      sideVentilation: 'portholes',
      doorType: 'revolving',
    });

    expect(errors.greenhouseType).toBeDefined();
    expect(errors.roofType).toBeDefined();
    expect(errors.structureMaterial).toBeDefined();
    expect(errors.sideVentilation).toBeDefined();
    expect(errors.doorType).toBeDefined();
  });

  it('rejects unknown states and districts from another state', () => {
    expect(validateFarmConfig({ ...validBaseConfig, stateName: 'Atlantis' }).stateName).toBeDefined();
    expect(
      validateFarmConfig({ ...validBaseConfig, stateName: 'Goa', district: 'Pune' }).district
    ).toBeDefined();
  });

  it('accepts Madhya Pradesh districts', () => {
    const errors = validateFarmConfig({ ...validBaseConfig, stateName: 'Madhya Pradesh', district: 'Indore' });
    expect(errors).toEqual({});
  });
});
