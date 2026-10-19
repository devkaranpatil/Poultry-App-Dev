import type { FarmConfig } from '@/types/farm';
import type { CalculationResult as FarmCalculationResult, ClimateData } from '@/types/farm';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  (import.meta.env.DEV ? 'http://localhost:5000' : '');

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Request failed');
  }

  return payload as T;
}

/**
 * Normalize a FarmConfig to the field names the backend expects.
 * Frontend uses `state` and `doorEntry`; backend normalizes both but
 * also validates `stateName` and `doorType` internally — sending the
 * canonical names avoids any ambiguity in the save/load cycle.
 */
export function toFarmPayload(config: FarmConfig): Record<string, unknown> {
  const { state, doorEntry, ...rest } = config;
  return { ...rest, stateName: state, doorType: doorEntry };
}

export async function calculateFarm(
  config: FarmConfig,
  signal?: AbortSignal
): Promise<FarmCalculationResult> {
  const response = await postJson<{ success: true; data: FarmCalculationResult }>(
    '/api/farm/calculate',
    toFarmPayload(config),
    signal
  );
  return response.data;
}

export async function fetchCropSuggestions(
  config: FarmConfig,
  climate: ClimateData,
  signal?: AbortSignal
): Promise<string> {
  // Backend returns { success, climateGroup, crops, suggestions } at the root level
  // (not nested under `data`), so we read `suggestions` directly.
  const response = await postJson<{
    success: true;
    climateGroup: string;
    crops: unknown[];
    suggestions: string;
  }>('/api/farm/crop-suggestions', { config: toFarmPayload(config), climate }, signal);

  return response.suggestions;
}

export interface BackendHealth {
  status: string;
  service: string;
  uptimeSeconds: number;
  nodeVersion: string;
  env: string;
}

export async function fetchBackendHealth(): Promise<BackendHealth> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Health check failed');
  }

  return payload as BackendHealth;
}
