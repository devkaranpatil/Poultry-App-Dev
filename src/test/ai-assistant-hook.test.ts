import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultPoultryAssumptions, type MeatAssumptions } from '@/lib/poultryFinance';
import { DEFAULT_CONFIG } from '@/types/farm';
import type { AdvisorReport } from '@/services/ai.service';
import type { Locale } from '@/i18n/messages';
import { useAiAssistant } from '@/hooks/useAiAssistant';

vi.mock('@/services/ai.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ai.service')>()),
  getAiStatus: vi.fn(async () => ({ enabled: true, model: 'stub' })),
  requestAdvisorReport: vi.fn(async () => ({ summary: 'stub' }) as unknown as AdvisorReport),
}));

describe('useAiAssistant', () => {
  it('marks the summary stale when the assumptions or language change, not only the design', async () => {
    const assumptions = defaultPoultryAssumptions(DEFAULT_CONFIG.birdType) as MeatAssumptions;
    const base = { token: 't', config: DEFAULT_CONFIG, assumptions, locale: 'en' as Locale };
    const { result, rerender } = renderHook((props: typeof base) => useAiAssistant(props), { initialProps: base });

    await act(() => result.current.generateAdvisor());
    await waitFor(() => expect(result.current.advisor).not.toBeNull());
    expect(result.current.advisorStale).toBe(false);

    rerender({ ...base, assumptions: { ...assumptions, saleInrPerKg: assumptions.saleInrPerKg + 5 } });
    expect(result.current.advisorStale).toBe(true);

    rerender(base);
    expect(result.current.advisorStale).toBe(false);

    rerender({ ...base, locale: 'hi' });
    expect(result.current.advisorStale).toBe(true);
  });
});
