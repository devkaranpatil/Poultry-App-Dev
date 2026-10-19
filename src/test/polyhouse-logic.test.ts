import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const polyhouseRouteModule = require('../../backend/routes/polyhouse.js');
const { normalizeAndSanitizeConfig, buildCalculationResult } = polyhouseRouteModule.__testables;

describe('polyhouse calculation regression', () => {
  it('enforces shade-net compatibility fields', () => {
    const normalized = normalizeAndSanitizeConfig({
      polyhouseType: 'shade-net',
      coverMaterial: 'uv-polyfilm',
      sideVentilation: 'manual-rollup',
      doorEntry: 'single-sliding',
      roofType: 'gable',
      gutterHeight: 4,
      ridgeHeight: 6,
      length: 30,
      width: 10,
      state: 'Goa',
      district: 'North Goa',
      structureMaterial: 'gi-steel',
    });

    expect(normalized.coverMaterial).toBe('shade_net');
    expect(normalized.sideVentilation).toBe('none');
    expect(normalized.doorType).toBe('curtain');
  });

  it('locks flat roof ridge height to gutter height', () => {
    const normalized = normalizeAndSanitizeConfig({
      roofType: 'flat',
      gutterHeight: 4,
      ridgeHeight: 7,
      polyhouseType: 'naturally-ventilated',
      length: 30,
      width: 10,
      state: 'Goa',
      district: 'North Goa',
      structureMaterial: 'gi-steel',
      coverMaterial: 'uv-polyfilm',
      sideVentilation: 'manual-rollup',
      doorEntry: 'single-sliding',
    });

    expect(normalized.ridgeHeight).toBe(4);
  });

  it('matches Goa benchmark cost output for 300 m2 naturally ventilated gable model', () => {
    const normalized = normalizeAndSanitizeConfig({
      length: 30,
      width: 10,
      gutterHeight: 4,
      ridgeHeight: 6,
      polyhouseType: 'naturally-ventilated',
      roofType: 'gable',
      structureMaterial: 'gi-steel',
      coverMaterial: 'uv-polyfilm',
      sideVentilation: 'manual-rollup',
      doorEntry: 'single-sliding',
      state: 'Goa',
      district: 'North Goa',
    });

    const result = buildCalculationResult(normalized);

    expect(result.cost.structureCost).toBe(255000);
    expect(result.cost.coverCost).toBe(36000);
    expect(result.cost.ventilationCost).toBe(13500);
    expect(result.cost.foundationCost).toBe(54000);
    expect(result.cost.irrigationCost).toBe(16500);
    expect(result.cost.electricalCost).toBe(0);
    expect(result.cost.laborCost).toBe(86250);
    expect(result.cost.miscCost).toBe(10500);
    expect(result.cost.totalCost).toBe(495338);
    expect(result.cost.costPerSqm).toBe(1651);
    expect(result.cost.climateAdjustment).toBe(0.05);
  });

  it('supports glass covering with upgraded irrigation systems', () => {
    const normalized = normalizeAndSanitizeConfig({
      length: 30,
      width: 10,
      gutterHeight: 4,
      ridgeHeight: 6,
      polyhouseType: 'climate-controlled',
      roofType: 'gable',
      structureMaterial: 'aluminium',
      coverMaterial: 'glass',
      sideVentilation: 'motorized-rollup',
      doorEntry: 'double-sliding',
      selectedCrop: 'lettuce',
      irrigationSystem: 'fogger',
      state: 'Goa',
      district: 'North Goa',
    });

    const result = buildCalculationResult(normalized);

    expect(result.cost.coverCost).toBe(78000);
    expect(result.cost.irrigationCost).toBe(28800);
    expect(result.selectedCrop?.name).toBe('Lettuce');
    expect(result.irrigation.system).toBe('fogger');
  });
});
