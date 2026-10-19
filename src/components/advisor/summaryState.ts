import type { AiAssistant } from '@/hooks/useAiAssistant';

/** Where the AI summary stands for the report: none yet, out of date, or ready and in or out. */
export type AiSummaryState = 'none' | 'stale' | 'included' | 'excluded';

/** The include switch only counts once a summary exists for the current setup. */
export function aiSummaryState(ai: AiAssistant | undefined, include: boolean): AiSummaryState {
  if (!ai?.advisor) return 'none';
  if (ai.advisorStale) return 'stale';
  return include ? 'included' : 'excluded';
}
