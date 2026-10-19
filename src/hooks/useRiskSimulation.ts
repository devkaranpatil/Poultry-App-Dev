import { useEffect, useMemo, useRef, useState } from 'react';
import type { FinanceAssumptions } from '@/lib/finance';
import { runRiskSimulation, type RiskResult, type RiskSimulation } from '@/services/risk.service';
import type { FarmConfig } from '@/types/farm';

export const RISK_HORIZONS = [5, 10, 15];
/** Wait for typing to settle before simulating again. */
const RERUN_DELAY_MS = 400;

export interface RiskState {
  result: RiskResult | null;
  status: 'idle' | 'running' | 'error';
  /** The shown result was run with other inputs and a new run is on its way. */
  stale: boolean;
  rerun: () => void;
}

/**
 * Runs the simulation whenever the setup, the assumptions or the horizon change, so the answer is always there
 * without a button press.
 */
export function useRiskSimulation(config: FarmConfig, assumptions: FinanceAssumptions, years: number): RiskState {
  const [result, setResult] = useState<RiskResult | null>(null);
  const [status, setStatus] = useState<RiskState['status']>('idle');
  const [ranFor, setRanFor] = useState('');
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputsKey = useMemo(() => JSON.stringify({ config, assumptions, years }), [config, assumptions, years]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('running');
      try {
        const next = await runRiskSimulation(config, assumptions, { years }, controller.signal);
        setResult(next);
        setRanFor(inputsKey);
        setStatus('idle');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setStatus('error');
      }
    }, RERUN_DELAY_MS);
    return () => window.clearTimeout(timer);
    // inputsKey stands for config, assumptions and years.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, attempt]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { result, status, stale: result !== null && ranFor !== inputsKey, rerun: () => setAttempt((value) => value + 1) };
}

/**
 * Share of futures whose profit earns back the money put in within the horizon. It counts rupees the way the
 * Earnings step does (no discounting), so the two steps agree; the discounted view stays in the details.
 */
export const paybackChance = (simulation: RiskSimulation) =>
  simulation.probabilities.paybackWithin[String(simulation.years)] ?? 1 - simulation.probabilities.loss;

export function verdictFor(chance: number): 'good' | 'mixed' | 'poor' {
  return chance >= 0.7 ? 'good' : chance >= 0.4 ? 'mixed' : 'poor';
}
