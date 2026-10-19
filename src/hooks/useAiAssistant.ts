import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AiRequestError,
  getAiStatus,
  requestAdvisorReport,
  requestAiCrops,
  streamChat,
  type AdvisorReport,
  type AiCropsResult,
  type AiScenario,
  type AiSource,
  type AiStatus,
  type ChatMessage,
} from '@/services/ai.service';
import type { FinanceAssumptions, FinancialSummary } from '@/lib/finance';
import type { Locale } from '@/i18n/messages';
import type { GreenhouseConfig } from '@/types/greenhouse';

interface UseAiAssistantInput {
  token: string | null;
  config: GreenhouseConfig;
  assumptions: FinanceAssumptions;
  financials: FinancialSummary | null;
  locale: Locale;
}

/** A result plus the exact configuration it was generated for. */
interface Keyed<T> {
  value: T;
  configKey: string;
}

/** i18n key describing why an AI request failed. */
export type AiErrorKey = 'ai.errorNotConfigured' | 'ai.errorRateLimited' | 'ai.errorBusy' | 'ai.errorUnavailable';

function toErrorKey(err: unknown): AiErrorKey {
  if (err instanceof AiRequestError) {
    if (err.code === 'AI_NOT_CONFIGURED') return 'ai.errorNotConfigured';
    if (err.code === 'RATE_LIMITED') return 'ai.errorRateLimited';
    if (err.code === 'AI_BUSY') return 'ai.errorBusy';
  }
  return 'ai.errorUnavailable';
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

export function useAiAssistant({ token, config, assumptions, financials, locale }: UseAiAssistantInput) {
  // Everything the AI reads goes in the key, so changing the finance, loan or language marks a summary stale.
  const configKey = JSON.stringify({ config, assumptions, financials, locale });
  const [status, setStatus] = useState<AiStatus | null>(null);

  const [advisor, setAdvisor] = useState<Keyed<AdvisorReport> | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorError, setAdvisorError] = useState<AiErrorKey | null>(null);

  const [crops, setCrops] = useState<Keyed<AiCropsResult> | null>(null);
  const [cropsLoading, setCropsLoading] = useState(false);
  const [cropsError, setCropsError] = useState<AiErrorKey | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatError, setChatError] = useState<AiErrorKey | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAiStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
      chatAbortRef.current?.abort();
    };
  }, []);

  const context = { config, assumptions, financials, locale };

  const generateAdvisor = useCallback(async () => {
    if (!token) return;
    const key = configKey;
    setAdvisorLoading(true);
    setAdvisorError(null);
    try {
      const report = await requestAdvisorReport(token, context);
      setAdvisor({ value: report, configKey: key });
    } catch (err) {
      setAdvisorError(toErrorKey(err));
    } finally {
      setAdvisorLoading(false);
    }
    // `context` is rebuilt from these on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, configKey, assumptions, financials, locale]);

  const generateCrops = useCallback(async () => {
    if (!token) return;
    const key = configKey;
    setCropsLoading(true);
    setCropsError(null);
    try {
      const result = await requestAiCrops(token, context);
      setCrops({ value: result, configKey: key });
    } catch (err) {
      setCropsError(toErrorKey(err));
    } finally {
      setCropsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, configKey, assumptions, financials, locale]);

  const sendChat = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!token || !content || chatStreaming) return;
      const history: ChatMessage[] = [...messages, { role: 'user', content }];
      setMessages([...history, { role: 'assistant', content: '' }]);
      setChatStreaming(true);
      setChatError(null);
      const controller = new AbortController();
      chatAbortRef.current = controller;

      let sources: AiSource[] | undefined;
      let unverified: string[] | undefined;
      let scenario: AiScenario | undefined;
      const updateReply = (reply: string) =>
        setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: reply, sources, unverified, scenario }]);

      try {
        await streamChat(token, context, history, updateReply, controller.signal, (found, unsupported, whatIf) => {
          sources = found;
          unverified = unsupported;
          scenario = whatIf;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return last?.role === 'assistant'
              ? [...prev.slice(0, -1), { ...last, sources: found, unverified: unsupported, scenario: whatIf }]
              : prev;
          });
        });
      } catch (err) {
        if (!isAbort(err)) {
          setChatError(toErrorKey(err));
          // Drop an empty assistant bubble so the conversation stays valid.
          setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -1)));
        }
      } finally {
        setChatStreaming(false);
        if (chatAbortRef.current === controller) chatAbortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, messages, chatStreaming, configKey, assumptions, financials, locale]
  );

  const stopChat = useCallback(() => chatAbortRef.current?.abort(), []);
  const resetChat = useCallback(() => {
    chatAbortRef.current?.abort();
    setMessages([]);
    setChatError(null);
  }, []);

  return {
    status,
    advisor: advisor?.value ?? null,
    advisorStale: Boolean(advisor && advisor.configKey !== configKey),
    advisorLoading,
    advisorError,
    generateAdvisor,
    crops: crops?.value ?? null,
    cropsStale: Boolean(crops && crops.configKey !== configKey),
    cropsLoading,
    cropsError,
    generateCrops,
    messages,
    chatStreaming,
    chatError,
    sendChat,
    stopChat,
    resetChat,
  };
}

export type AiAssistant = ReturnType<typeof useAiAssistant>;
