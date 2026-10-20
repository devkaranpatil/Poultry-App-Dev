import { createRequire } from 'module';
import { DEFAULT_CONFIG, type CalculationResult, type FarmConfig } from '@/types/farm';
import type { PoultryAssumptions } from '@/lib/poultryFinance';

const require = createRequire(import.meta.url);
const { runPoultryCalculation } = require('../../../backend/services/poultry/calculator');

/** A 1,076-bird open broiler shed in Nagpur, the setup most tests start from. */
export const SAMPLE_CONFIG: FarmConfig = { ...DEFAULT_CONFIG, length: 20, width: 5, state: 'Maharashtra', district: 'Nagpur' };

/**
 * The real calculation for a setup, worked out by the backend calculator, so component tests show the figures the
 * server would send.
 */
export function sampleResult(config: FarmConfig = SAMPLE_CONFIG, assumptions: Partial<PoultryAssumptions> = {}): CalculationResult {
  const { result, errors } = runPoultryCalculation({ ...config, stateName: config.state }, assumptions);
  if (errors) throw new Error(`Invalid sample setup: ${JSON.stringify(errors)}`);
  return { ...result, reference: null } as CalculationResult;
}
