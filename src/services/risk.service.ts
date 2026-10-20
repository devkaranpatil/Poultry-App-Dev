import { z } from 'zod';
import type { PoultryAssumptions } from '@/lib/poultryFinance';
import type { FarmConfig } from '@/types/farm';
import { toFarmPayload } from '@/services/calculation.service';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || (import.meta.env.DEV ? 'http://localhost:5000' : '');

const percentiles = z.object({ p10: z.number().nullable(), p50: z.number().nullable(), p90: z.number().nullable() });

export const RISK_DRIVERS = ['mortality', 'fcr', 'feedEaten', 'salePrice', 'feedPrice', 'buildCost', 'outbreak'] as const;

const simulationSchema = z.object({
  trials: z.number(),
  years: z.number(),
  npv: percentiles,
  paybackYears: percentiles,
  annualProfit: percentiles,
  probabilities: z.object({ loss: z.number(), paybackWithin: z.record(z.string(), z.number()), outbreakYear: z.number() }),
  histogram: z.array(z.object({ from: z.number(), to: z.number(), count: z.number() })),
  drivers: z.array(
    z.object({
      driver: z.enum(RISK_DRIVERS),
      npvAtP10: z.number(),
      npvAtP90: z.number(),
      range: z.number(),
    })
  ),
  assumptions: z.object({
    mortalityRangePct: z.array(z.number()),
    conversionRange: z.array(z.number()),
    salePriceSigmaLog: z.number(),
    feedPriceBandPct: z.number(),
    outbreakChancePct: z.number(),
    costBand: z.number(),
    discountRatePct: z.number(),
  }),
});

/** The server's answer, checked: a page never renders numbers that are not there. */
const riskResponseSchema = z.object({
  simulation: simulationSchema,
  sources: z.object({
    price: z.object({ sigmaLog: z.number(), basis: z.enum(['history', 'markets', 'assumption']) }),
    buildCost: z.object({ low: z.number(), high: z.number() }),
  }),
});

export type RiskResult = z.infer<typeof riskResponseSchema>;
export type RiskSimulation = RiskResult['simulation'];

export interface RiskOptions {
  years?: number;
  discountRatePct?: number;
  /** Yearly chance of an outbreak that loses a batch, in percent. */
  outbreakChancePct?: number;
}

/** Runs the Monte Carlo simulation for a setup and the farmer's planning assumptions. */
export async function runRiskSimulation(
  config: FarmConfig,
  assumptions: Partial<PoultryAssumptions>,
  options: RiskOptions = {},
  signal?: AbortSignal
): Promise<RiskResult> {
  const { outbreakChancePct, ...run } = options;
  const response = await fetch(`${API_BASE_URL}/api/risk/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      config: toFarmPayload(config),
      assumptions,
      risk: outbreakChancePct === undefined ? {} : { outbreakChancePct },
      options: run,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.message || 'Request failed');
  const parsed = riskResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error('The risk simulation returned an unexpected answer');
  return parsed.data;
}
