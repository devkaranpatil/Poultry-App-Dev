import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateFarm, fetchCropSuggestions } from '@/services/calculation.service';
import type { CalculationResult, FarmConfig } from '@/types/farm';

const config: FarmConfig = {
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
  state: 'Goa',
  district: 'North Goa',
};

const resultPayload: CalculationResult = {
  area: 300,
  volume: 1500,
  climate: {
    climateZone: 'Tropical Coastal',
    avgTemperature: 27,
    humidity: 78,
    rainfall: 2900,
    climateFactor: 1.05,
    advisories: [],
  },
  cost: {
    structureCost: 255000,
    coverCost: 36000,
    ventilationCost: 13500,
    foundationCost: 54000,
    irrigationCost: 16500,
    electricalCost: 0,
    laborCost: 86250,
    miscCost: 10500,
    totalCost: 495338,
    costPerSqm: 1651,
    climateAdjustment: 0.05,
  },
  crops: [],
  selectedCrop: null,
  irrigation: {
    system: 'drip',
    ratePerSqm: 55,
    notes: ['Best fit for row crops with strong water-use efficiency.'],
  },
};

// The service renames `state`/`doorEntry` to the backend's canonical field names.
const { state, doorEntry, ...restConfig } = config;
const expectedPayload = { ...restConfig, stateName: state, doorType: doorEntry };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('calculation.service', () => {
  it('posts config to calculate endpoint and returns data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: resultPayload }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await calculateFarm(config);

    expect(result).toEqual(resultPayload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/farm/calculate');
    expect(request.method).toBe('POST');
    expect(request.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual(expectedPayload);
  });

  it('throws backend message on failed calculate response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, message: 'Validation failed' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(calculateFarm(config)).rejects.toThrow('Validation failed');
  });

  it('posts config+climate to crop-suggestions endpoint and returns text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, suggestions: 'Use cucumber and capsicum.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await fetchCropSuggestions(config, resultPayload.climate);
    expect(suggestions).toBe('Use cucumber and capsicum.');

    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/farm/crop-suggestions');
    expect(JSON.parse(request.body)).toEqual({
      config: expectedPayload,
      climate: resultPayload.climate,
    });
  });
});
