import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validatePolyhouseConfig } = require('../../backend/validators/polyhouseValidator.js');

const validBaseConfig = {
  length: 30,
  width: 10,
  gutterHeight: 4,
  ridgeHeight: 6,
  polyhouseType: 'naturally-ventilated',
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

describe('polyhouse validator', () => {
  it('accepts district names with numbers', () => {
    const errors = validatePolyhouseConfig({
      ...validBaseConfig,
      stateName: 'West Bengal',
      district: 'North 24 Parganas',
    });

    expect(errors.district).toBeUndefined();
  });

  it('rejects invalid state names with digits', () => {
    const errors = validatePolyhouseConfig({
      ...validBaseConfig,
      stateName: 'Goa123',
    });

    expect(errors.stateName).toBeDefined();
  });

  it('enforces flat-roof ridge/gutter equality', () => {
    const errors = validatePolyhouseConfig({
      ...validBaseConfig,
      roofType: 'flat',
      gutterHeight: 4,
      ridgeHeight: 5,
    });

    expect(errors.heightLogic).toContain('flat roof');
  });

  it('enforces shade-net compatibility rules', () => {
    const errors = validatePolyhouseConfig({
      ...validBaseConfig,
      polyhouseType: 'shade-net',
      coverMaterial: 'uv_polyfilm',
      sideVentilation: 'manual-rollup',
      doorType: 'single-sliding',
    });

    expect(errors.coverMaterial).toBeDefined();
    expect(errors.sideVentilation).toBeDefined();
    expect(errors.doorType).toBeDefined();
  });

  it('rejects invalid cultivation selections', () => {
    const errors = validatePolyhouseConfig({
      ...validBaseConfig,
      selectedCrop: 'banana',
      irrigationSystem: 'flood',
    });

    expect(errors.selectedCrop).toBeDefined();
    expect(errors.irrigationSystem).toBeDefined();
  });
});
