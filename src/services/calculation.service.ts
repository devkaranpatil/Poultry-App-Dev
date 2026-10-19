import type { GreenhouseConfig } from '@/types/greenhouse';
import type { CalculationResult as GreenhouseCalculationResult, ClimateData } from '@/types/greenhouse';
import type { PolyhouseConfig } from '@/types/polyhouse';
import type { CalculationResult as PolyhouseCalculationResult } from '@/types/polyhouse';

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
 * Normalize a GreenhouseConfig to the field names the backend expects.
 * Frontend uses `state` and `doorEntry`; backend normalizes both but
 * also validates `stateName` and `doorType` internally — sending the
 * canonical names avoids any ambiguity in the save/load cycle.
 */
export function toGreenhousePayload(config: GreenhouseConfig): Record<string, unknown> {
  const { state, doorEntry, ...rest } = config;
  return { ...rest, stateName: state, doorType: doorEntry };
}

/**
 * Normalize a PolyhouseConfig to the field names the backend expects.
 */
function toPolyhousePayload(config: PolyhouseConfig): Record<string, unknown> {
  const { state, doorEntry, ...rest } = config;
  return { ...rest, stateName: state, doorType: doorEntry };
}

export async function calculateGreenhouse(
  config: GreenhouseConfig,
  signal?: AbortSignal
): Promise<GreenhouseCalculationResult> {
  const response = await postJson<{ success: true; data: GreenhouseCalculationResult }>(
    '/api/greenhouse/calculate',
    toGreenhousePayload(config),
    signal
  );
  return response.data;
}

export async function calculatePolyhouse(
  config: PolyhouseConfig,
  signal?: AbortSignal
): Promise<PolyhouseCalculationResult> {
  const response = await postJson<{ success: true; data: PolyhouseCalculationResult }>(
    '/api/polyhouse/calculate',
    toPolyhousePayload(config),
    signal
  );
  return response.data;
}

export async function fetchCropSuggestions(
  config: GreenhouseConfig,
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
  }>('/api/greenhouse/crop-suggestions', { config: toGreenhousePayload(config), climate }, signal);

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
