import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultFinanceAssumptions } from '@/lib/finance';
import { DEFAULT_CONFIG } from '@/types/greenhouse';
import type { AdvisorReport } from '@/services/ai.service';
import type { Locale } from '@/i18n/messages';
import { useAiAssistant } from '@/hooks/useAiAssistant';

vi.mock('@/services/ai.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ai.service')>()),
  getAiStatus: vi.fn(async () => ({ enabled: true, model: 'stub' })),
  requestAdvisorReport: vi.fn(async () => ({ summary: 'stub' }) as unknown as AdvisorReport),
}));

describe('useAiAssistant', () => {
  it('marks the summary stale when the finance or language changes, not only the design', async () => {
    const assumptions = defaultFinanceAssumptions(DEFAULT_CONFIG.selectedCrop);
    const base = { token: 't', config: DEFAULT_CONFIG, assumptions, financials: null, locale: 'en' as Locale };
    const { result, rerender } = renderHook((props: typeof base) => useAiAssistant(props), { initialProps: base });

    await act(() => result.current.generateAdvisor());
    await waitFor(() => expect(result.current.advisor).not.toBeNull());
    expect(result.current.advisorStale).toBe(false);

    rerender({ ...base, assumptions: { ...assumptions, pricePerUnit: assumptions.pricePerUnit + 5 } });
    expect(result.current.advisorStale).toBe(true);

    rerender(base);
    expect(result.current.advisorStale).toBe(false);

    rerender({ ...base, locale: 'hi' });
    expect(result.current.advisorStale).toBe(true);
  });
});
