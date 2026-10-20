import type { FarmConfig } from '@/types/farm';
import type { CalculationResult as FarmCalculationResult } from '@/types/farm';
import type { PoultryAssumptions } from '@/lib/poultryFinance';

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

/** The setup as the backend names it: `stateName` for the state (the backend accepts both). */
export function toFarmPayload(config: FarmConfig): Record<string, unknown> {
  const { state, ...rest } = config;
  return { ...rest, stateName: state };
}

/** Every figure for a setup and the farmer's planning assumptions, worked out by the server. */
export async function calculateFarm(
  config: FarmConfig,
  assumptions: Partial<PoultryAssumptions>,
  signal?: AbortSignal
): Promise<FarmCalculationResult> {
  const response = await postJson<{ success: true; data: FarmCalculationResult }>(
    '/api/farm/calculate',
    { config: toFarmPayload(config), assumptions },
    signal
  );
  return response.data;
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
