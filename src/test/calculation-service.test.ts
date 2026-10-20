import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateFarm, toFarmPayload } from '@/services/calculation.service';
import { DEFAULT_CONFIG, type FarmConfig } from '@/types/farm';

const config: FarmConfig = { ...DEFAULT_CONFIG, length: 20, width: 5, state: 'Maharashtra', district: 'Nagpur' };
const resultPayload = { flock: { birds: 1076 } };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('calculation.service', () => {
  it('names the state as the backend does', () => {
    const { state, ...rest } = config;
    expect(toFarmPayload(config)).toEqual({ ...rest, stateName: state });
  });

  it('posts the setup and the assumptions to the calculate endpoint and returns the data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: resultPayload }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await calculateFarm(config, { saleInrPerKg: 110 });

    expect(result).toEqual(resultPayload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/farm/calculate');
    expect(request.method).toBe('POST');
    expect(request.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({ config: toFarmPayload(config), assumptions: { saleInrPerKg: 110 } });
  });

  it('throws the backend message on a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, message: 'Validation failed' }) }));
    await expect(calculateFarm(config, {})).rejects.toThrow('Validation failed');
  });
});
