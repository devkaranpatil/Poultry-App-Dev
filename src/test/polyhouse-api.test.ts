/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const app = require('../../backend/app');

describe('polyhouse API integration', () => {
  it('returns backend health payload', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('healthy');
    expect(response.body.service).toBe('greenhouse-backend');
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('returns backend meta payload', async () => {
    const response = await request(app).get('/api/meta');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.service).toBe('greenhouse-backend');
    expect(response.body.rateLimit.max).toBeGreaterThan(0);
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('returns validated calculation output for Goa benchmark scenario', async () => {
    const response = await request(app).post('/api/polyhouse/calculate').send({
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

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.cost.totalCost).toBe(495338);
    expect(response.body.data.cost.costPerSqm).toBe(1651);
    expect(response.body.data.cost.climateAdjustment).toBe(0.05);
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('returns estimate-cost payload with base + climate factor + final', async () => {
    const response = await request(app).post('/api/polyhouse/estimate-cost').send({
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

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.cost.baseCost.totalCost).toBe(471750);
    expect(response.body.cost.climateFactor).toBe(1.05);
    expect(response.body.cost.finalCost).toBe(495338);
  });

  it('returns cultivation-aware results for glass + fogger configurations', async () => {
    const response = await request(app).post('/api/polyhouse/calculate').send({
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

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.cost.coverCost).toBe(78000);
    expect(response.body.data.cost.irrigationCost).toBe(28800);
    expect(response.body.data.selectedCrop.name).toBe('Lettuce');
    expect(response.body.data.irrigation.system).toBe('fogger');
  });

  it('returns validation errors for invalid payload', async () => {
    const response = await request(app).post('/api/polyhouse/calculate').send({
      length: 0,
      width: 0,
      state: '',
      district: '',
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.errors).toBeDefined();
  });

  it('rejects invalid estimate-cost payloads', async () => {
    const response = await request(app).post('/api/polyhouse/estimate-cost').send({
      length: 0,
      width: 0,
      state: '',
      district: '',
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.errors).toBeDefined();
  });

  it('rejects invalid crop-suggestions payloads', async () => {
    const response = await request(app).post('/api/polyhouse/crop-suggestions').send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.errors).toBeDefined();
  });
});
