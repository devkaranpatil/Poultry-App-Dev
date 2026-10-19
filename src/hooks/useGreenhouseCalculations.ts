import { useState, useCallback, useEffect, useRef } from 'react';
import { GreenhouseConfig, CalculationResult } from '@/types/greenhouse';
import { calculateGreenhouse } from '@/services/calculation.service';

const MAX_CACHED_RESULTS = 50;

export function useGreenhouseCalculations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [lastCalculatedKey, setLastCalculatedKey] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, CalculationResult>());
  const inFlightRef = useRef<AbortController | null>(null);

  const calculate = useCallback(async (config: GreenhouseConfig) => {
    const cacheKey = JSON.stringify(config);
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResult(cached);
      setError(null);
      setLastCalculatedKey(cacheKey);
      return cached;
    }

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const data = await calculateGreenhouse(config, controller.signal);
      cacheRef.current.set(cacheKey, data);
      if (cacheRef.current.size > MAX_CACHED_RESULTS) {
        // Maps iterate in insertion order, so the first key is the oldest.
        const oldestKey = cacheRef.current.keys().next().value;
        if (oldestKey !== undefined) cacheRef.current.delete(oldestKey);
      }
      setResult(data);
      setLastCalculatedKey(cacheKey);
      return data;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      const message = err instanceof Error ? err.message : 'Calculation failed';
      // Tie the error to this config so the page shows it, and drop the previous
      // result so it is never presented as the outcome for this config.
      setResult(null);
      setError(message);
      setLastCalculatedKey(cacheKey);
      return null;
    } finally {
      // A superseded request must not clear the spinner of the one replacing it.
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => inFlightRef.current?.abort();
  }, []);

  return { calculate, isLoading, error, result, lastCalculatedKey };
}
