import { z } from 'zod';
import type { FinanceAssumptions } from '@/lib/finance';
import type { FarmConfig } from '@/types/farm';
import { toFarmPayload } from '@/services/calculation.service';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || (import.meta.env.DEV ? 'http://localhost:5000' : '');

const percentiles = z.object({ p10: z.number().nullable(), p50: z.number().nullable(), p90: z.number().nullable() });

const simulationSchema = z.object({
  trials: z.number(),
  years: z.number(),
  npv: percentiles,
  paybackYears: percentiles,
  annualProfit: percentiles,
  probabilities: z.object({ loss: z.number(), paybackWithin: z.record(z.string(), z.number()) }),
  histogram: z.array(z.object({ from: z.number(), to: z.number(), count: z.number() })),
  drivers: z.array(
    z.object({
      driver: z.enum(['yield', 'price', 'buildCost', 'operatingCost']),
      npvAtP10: z.number(),
      npvAtP90: z.number(),
      range: z.number(),
    })
  ),
  assumptions: z.object({ priceSigmaLog: z.number(), costBand: z.number(), operatingCostPoints: z.number(), discountRatePct: z.number() }),
});

/** The server's answer, checked: a page never renders numbers that are not there. */
const riskResponseSchema = z.object({
  simulation: simulationSchema,
  sources: z.object({
    yield: z.object({ range: z.string(), published: z.boolean(), source: z.string().nullable() }),
    price: z.object({
      sigmaLog: z.number(),
      basis: z.enum(['history', 'markets', 'assumption']),
      days: z.number(),
      markets: z.number(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
    buildCost: z.object({ low: z.number(), high: z.number() }),
  }),
});

export type RiskResult = z.infer<typeof riskResponseSchema>;
export type RiskSimulation = RiskResult['simulation'];

export interface RiskOptions {
  years?: number;
  discountRatePct?: number;
}

/** Runs the Monte Carlo simulation for a setup and the user's planning assumptions. */
export async function runRiskSimulation(
  config: FarmConfig,
  assumptions: FinanceAssumptions,
  options: RiskOptions = {},
  signal?: AbortSignal
): Promise<RiskResult> {
  const response = await fetch(`${API_BASE_URL}/api/risk/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ config: toFarmPayload(config), assumptions, options }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.message || 'Request failed');
  const parsed = riskResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error('The risk simulation returned an unexpected answer');
  return parsed.data;
}
