import { normalizeFarmConfig, type FarmConfig } from '@/types/farm';

/**
 * Carries a no-account estimate into the workspace, so "Save and refine" opens the same farm with the same prices.
 * It lives in localStorage (not sessionStorage) so it survives a Google sign-in redirect or confirming an email in
 * another tab; it is read once and expires after a day.
 */
const HANDOFF_KEY = 'farm.estimateHandoff.v1';
export const HANDOFF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface EstimateHandoff {
  config: FarmConfig;
  /** The prices and rates the user changed on the estimate, by assumption field. */
  overrides: Record<string, number>;
}

export function saveEstimateHandoff(config: FarmConfig, overrides: Record<string, number>, savedAt = Date.now()): void {
  try {
    window.localStorage.setItem(HANDOFF_KEY, JSON.stringify({ savedAt, config, overrides }));
  } catch {
    // Storage can be full or blocked; the workspace then starts from its own draft.
  }
}

export function takeEstimateHandoff(now = Date.now()): EstimateHandoff | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(HANDOFF_KEY);
    window.localStorage.removeItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown; config?: unknown; overrides?: unknown };
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > HANDOFF_MAX_AGE_MS) return null;
    if (!parsed.config || typeof parsed.config !== 'object') return null;
    const overrides = Object.fromEntries(
      Object.entries((parsed.overrides ?? {}) as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])
      )
    );
    return { config: normalizeFarmConfig(parsed.config as Partial<FarmConfig>), overrides };
  } catch {
    return null;
  }
}
