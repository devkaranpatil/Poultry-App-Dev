import { z } from 'zod';
import type { GreenhouseConfig } from '@/types/greenhouse';
import type { FinanceAssumptions, FinancialSummary } from '@/lib/finance';
import type { Locale } from '@/i18n/messages';
import { toGreenhousePayload } from '@/services/calculation.service';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || (import.meta.env.DEV ? 'http://localhost:5000' : '');

/** Marker the backend appends if the stream fails after it has started. */
const STREAM_ERROR_MARKER = '[[AI_STREAM_ERROR]]';
/** Marker after which the backend sends the sources of the answer, as JSON. */
const SOURCES_MARKER = '[[AI_SOURCES]]';

export type AdvisorVerdict = 'strong' | 'viable' | 'marginal' | 'weak';
export type RecommendationCategory = 'structure' | 'crop' | 'climate' | 'cost' | 'operations';

export interface AdvisorReport {
  summary: string;
  verdict: AdvisorVerdict;
  strengths: string[];
  risks: Array<{ title: string; detail: string; severity: 'low' | 'medium' | 'high' }>;
  recommendations: Array<{ title: string; detail: string; category: RecommendationCategory; impact: string }>;
}

export interface AiCropSuggestion {
  name: string;
  suitability: 'excellent' | 'good' | 'moderate' | 'poor';
  reason: string;
  expectedYield: string;
  season: string;
  marketNote: string;
}

export interface AiCropsResult {
  crops: AiCropSuggestion[];
  note: string;
}

/** A document passage the assistant used for an answer. `cited` is false when it only looks related. */
/** Only web links become clickable: anything else (say a javascript: URL) is shown as plain text. */
const webUrl = z
  .string()
  .nullable()
  .transform((url) => (url && /^https?:\/\//i.test(url) ? url : null));

const aiSourceSchema = z.object({
  n: z.number(),
  title: z.string(),
  publisher: z.string().catch(''),
  url: webUrl.catch(null),
  section: z.string().nullable().catch(null),
  cited: z.boolean().catch(false),
});

export type AiSource = z.infer<typeof aiSourceSchema>;

/** Keeps the sources that have the expected shape; a broken item is dropped instead of breaking the reply. */
const sourceList = z.array(z.unknown()).transform((items) =>
  items.flatMap((item) => {
    const parsed = aiSourceSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  })
);

const scenarioFigures = z.object({
  areaSqm: z.number(),
  totalCostInr: z.number(),
  subsidyInr: z.number(),
  subsidyScheme: z.string().nullable(),
  netInvestmentInr: z.number().nullable(),
  annualProfitInr: z.number().nullable(),
  paybackYears: z.number().nullable(),
});

/** A "what if" the planner calculated for this answer: the change, and the figures now and with it. */
const scenarioSchema = z.object({
  changes: z.array(z.object({ field: z.string(), from: z.union([z.string(), z.number()]).nullable(), to: z.union([z.string(), z.number()]) })),
  baseline: scenarioFigures.optional(),
  scenario: scenarioFigures.optional(),
  note: z.string().nullable().optional(),
  error: z.string().optional(),
});

export type AiScenario = z.infer<typeof scenarioSchema>;

/** What the backend appends after an answer: the sources, figures the sources do not support, and any what-if. */
const replyTrailerSchema = z.union([
  z.object({
    sources: sourceList,
    unverified: z.array(z.coerce.string()).catch([]),
    scenario: scenarioSchema.optional().catch(undefined),
  }),
  sourceList.transform((sources) => ({ sources, unverified: [] as string[], scenario: undefined })), // the older bare-array form
]);

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: AiSource[];
  /** Figures in the answer that appear in none of its sources or in the project's own numbers. */
  unverified?: string[];
  /** A "what if" the planner calculated for this answer. */
  scenario?: AiScenario;
}

export interface AiProjectContext {
  config: GreenhouseConfig;
  assumptions?: FinanceAssumptions;
  financials?: FinancialSummary | null;
  locale: Locale;
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly code: 'AI_NOT_CONFIGURED' | 'AI_UNAVAILABLE' | 'AI_BUSY' | 'RATE_LIMITED' | 'UNKNOWN' = 'UNKNOWN'
  ) {
    super(message);
    this.name = 'AiRequestError';
  }
}

function buildBody(context: AiProjectContext, extra: Record<string, unknown> = {}) {
  const { assumptions, financials } = context;
  return JSON.stringify({
    config: toGreenhousePayload(context.config),
    locale: context.locale,
    financials:
      financials && assumptions
        ? {
            subsidyPct: assumptions.subsidyPct,
            operatingCostPct: assumptions.operatingCostPct,
            yieldPerSqm: assumptions.yieldPerSqm,
            pricePerUnit: assumptions.pricePerUnit,
            netInvestment: Math.round(financials.netInvestment),
            annualRevenue: Math.round(financials.annualRevenue),
            annualProfit: Math.round(financials.annualProfit),
            paybackYears: financials.paybackYears,
            roi: financials.roi,
          }
        : undefined,
    ...extra,
  });
}

async function toAiError(response: Response): Promise<AiRequestError> {
  const payload = await response.json().catch(() => ({}));
  const code =
    response.status === 429
      ? 'RATE_LIMITED'
      : payload?.code === 'AI_NOT_CONFIGURED' || payload?.code === 'AI_UNAVAILABLE' || payload?.code === 'AI_BUSY'
        ? payload.code
        : 'UNKNOWN';
  return new AiRequestError(payload?.message || 'AI request failed', code);
}

async function postAi(path: string, token: string, body: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new AiRequestError('Cannot reach the server. Check your connection and try again.', 'AI_UNAVAILABLE');
  }
}

export interface AiStatus {
  enabled: boolean;
  model: string | null;
  /** How the assistant looks things up: keywords only, or keywords plus embeddings. */
  retrieval?: { mode: 'keyword' | 'hybrid'; passages: number; documents: number; embeddings: string; embeddingProgress: number };
}

export async function getAiStatus(): Promise<AiStatus> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ai/status`);
    const payload = await response.json();
    return { enabled: Boolean(payload?.enabled), model: payload?.model ?? null, retrieval: payload?.retrieval };
  } catch {
    return { enabled: false, model: null };
  }
}

export async function requestAdvisorReport(
  token: string,
  context: AiProjectContext,
  signal?: AbortSignal
): Promise<AdvisorReport> {
  const response = await postAi('/api/ai/advisor', token, buildBody(context), signal);
  if (!response.ok) throw await toAiError(response);
  const payload = await response.json();
  return payload.report as AdvisorReport;
}

export async function requestAiCrops(
  token: string,
  context: AiProjectContext,
  signal?: AbortSignal
): Promise<AiCropsResult> {
  const response = await postAi('/api/ai/crops', token, buildBody(context), signal);
  if (!response.ok) throw await toAiError(response);
  const payload = await response.json();
  return { crops: payload.crops ?? [], note: payload.note ?? '' };
}

/** Does the text end with the start of a marker (e.g. "[[AI_SO")? Then wait for more before showing it. */
function endsWithPartialMarker(text: string): number {
  for (const marker of [SOURCES_MARKER, STREAM_ERROR_MARKER]) {
    for (let length = Math.min(marker.length - 1, text.length); length > 0; length -= 1) {
      if (text.endsWith(marker.slice(0, length))) return text.length - length;
    }
  }
  return -1;
}

interface ReplyParts {
  answer: string;
  sources: AiSource[] | undefined;
  unverified: string[];
  scenario?: AiScenario;
}

/** Splits a streamed reply into the answer to display and the sources the backend appended after it. */
function splitReply(raw: string): ReplyParts {
  const markerAt = raw.indexOf(SOURCES_MARKER);
  if (markerAt >= 0) {
    let sources: AiSource[] | undefined;
    let unverified: string[] = [];
    let scenario: AiScenario | undefined;
    try {
      const trailer = replyTrailerSchema.safeParse(JSON.parse(raw.slice(markerAt + SOURCES_MARKER.length)));
      if (trailer.success) ({ sources, unverified, scenario } = trailer.data);
    } catch {
      sources = undefined; // the JSON has not fully arrived yet
    }
    return { answer: raw.slice(0, markerAt).trimEnd(), sources, unverified, scenario };
  }
  const partialAt = endsWithPartialMarker(raw);
  return { answer: partialAt >= 0 ? raw.slice(0, partialAt) : raw, sources: undefined, unverified: [] };
}

/**
 * Sends the conversation and streams the assistant's reply, calling `onText`
 * with the full text so far after every chunk and `onSources` once the sources
 * of the answer arrive. Resolves with the final text.
 */
export async function streamChat(
  token: string,
  context: AiProjectContext,
  messages: ChatMessage[],
  onText: (textSoFar: string) => void,
  signal?: AbortSignal,
  onSources?: (sources: AiSource[], unverified: string[], scenario?: AiScenario) => void
): Promise<string> {
  const outgoing = messages.map(({ role, content }) => ({ role, content })); // sources are display-only
  const response = await postAi('/api/ai/chat', token, buildBody(context, { messages: outgoing }), signal);
  if (!response.ok) throw await toAiError(response);
  if (!response.body) {
    const { answer, sources, unverified, scenario } = splitReply(await response.text());
    onText(answer);
    if (sources) onSources?.(sources, unverified, scenario);
    return answer;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let shown: string | null = null;
  const show = (text: string) => {
    if (text === shown) return; // nothing new to display (for example while the sources trailer arrives)
    shown = text;
    onText(text);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    const errorAt = raw.indexOf(STREAM_ERROR_MARKER);
    if (errorAt >= 0) {
      show(splitReply(raw.slice(0, errorAt)).answer.trimEnd());
      throw new AiRequestError('The AI reply was interrupted. Please try again.', 'AI_UNAVAILABLE');
    }
    show(splitReply(raw).answer);
  }
  raw += decoder.decode();
  const { answer, sources, unverified, scenario } = splitReply(raw);
  show(answer);
  if (sources) onSources?.(sources, unverified, scenario);
  return answer;
}
