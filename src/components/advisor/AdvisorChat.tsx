import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUp, BookOpen, Bot, ChevronDown, Loader2, LogIn, MessageCircle, Sparkles, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/context/I18nContext';
import type { AiAssistant } from '@/hooks/useAiAssistant';
import type { AiScenario, ChatMessage } from '@/services/ai.service';
import { formatINRCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AiNotConfigured } from './AdvisorReview';

/** The figures the planner calculated for a "what if" answer, now and with the change. */
function ScenarioTable({ scenario }: { scenario: AiScenario }) {
  const { t } = useI18n();
  if (scenario.error) {
    return <p className="mt-3 text-xs text-muted-foreground">{t('ai.whatIfError', { error: scenario.error })}</p>;
  }
  const { baseline, scenario: next } = scenario;
  if (!baseline || !next) return null;
  const money = (value: number | null) => (value === null ? '—' : formatINRCompact(value));
  const payback = (value: number | null) => (value === null ? '—' : t('returns.paybackYears', { years: formatNumber(value) }));
  const breakEven = (figures: typeof baseline) =>
    figures.breakEvenPrice === null
      ? '—'
      : t(figures.product === 'eggs' ? 'returns.perEgg' : 'returns.perKg', { price: formatNumber(figures.breakEvenPrice) });
  const rows: Array<[string, string, string]> = [
    [t('ai.whatIfBirds'), formatNumber(baseline.birds), formatNumber(next.birds)],
    [t('ai.whatIfCost'), money(baseline.capitalCostInr), money(next.capitalCostInr)],
    [t('ai.whatIfSubsidy'), money(baseline.subsidyInr), money(next.subsidyInr)],
    [t('ai.whatIfNet'), money(baseline.netInvestmentInr), money(next.netInvestmentInr)],
    [t('ai.whatIfProfit'), money(baseline.annualProfitInr), money(next.annualProfitInr)],
    [t('ai.whatIfPayback'), payback(baseline.paybackYears), payback(next.paybackYears)],
    [t('ai.whatIfBreakEven'), breakEven(baseline), breakEven(next)],
  ];
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background">
      <table className="w-full text-xs" aria-label={t('ai.whatIfTitle')}>
        <caption className="border-b border-border bg-muted/50 px-3 py-2 text-left font-medium text-foreground">{t('ai.whatIfTitle')}</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-3 pt-2 text-left font-normal" />
            <th className="px-3 pt-2 text-right font-normal">{t('ai.whatIfNow')}</th>
            <th className="px-3 pt-2 text-right font-normal">{t('ai.whatIfChanged')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, now, changed]) => (
            <tr key={label} className="border-t border-border/60 first:border-t-0">
              <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{now}</td>
              <td className="px-3 py-1.5 text-right font-medium tabular-nums">{changed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where an answer came from, folded into one line until the farmer wants to check it. */
function SourceList({ message }: { message: ChatMessage }) {
  const { t } = useI18n();
  const sources = message.sources ?? [];
  if (sources.length === 0) return null;
  const label = sources[0].cited ? t('ai.sources') : t('ai.relatedSources');
  return (
    <details className="group mt-3 rounded-lg border border-border bg-background text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        {label} ({sources.length})
        <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ol className="space-y-1 border-t border-border px-3 py-2 leading-snug text-muted-foreground" aria-label={label}>
        {sources.map((source) => (
          <li key={source.n}>
            [{source.n}]{' '}
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer noopener" className="text-foreground underline underline-offset-2 hover:text-primary">
                {source.title}
              </a>
            ) : (
              <span className="text-foreground">{source.title}</span>
            )}
            {' · '}
            {source.publisher}
          </li>
        ))}
      </ol>
    </details>
  );
}

function MessageBubble({ message, pending }: { message: ChatMessage; pending: boolean }) {
  const { t } = useI18n();
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-card rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 max-w-[92%] flex-1 rounded-card rounded-tl-md border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm">
        {message.content ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : pending ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('ai.thinking')}
          </span>
        ) : null}
        {message.scenario ? <ScenarioTable scenario={message.scenario} /> : null}
        {message.unverified && message.unverified.length > 0 ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-warning/10 px-3 py-2 text-xs leading-snug text-warning " role="note">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t('ai.unverified')} {message.unverified.join(', ')}
            </span>
          </p>
        ) : null}
        <SourceList message={message} />
      </div>
    </div>
  );
}

/** Centred notice used for the states where the chat cannot run yet. */
function Notice({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6 text-center">{children}</div>;
}

export interface AdvisorChatProps {
  /** Missing when the user is signed out. */
  ai?: AiAssistant;
  /** The design is complete and calculated, so answers have figures to work from. */
  ready: boolean;
  /** Example questions that fit the step the user is on. */
  suggestions: string[];
  /** The unsent question, kept by the caller so it survives switching to full screen. */
  draft: string;
  onDraftChange: (draft: string) => void;
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Opens the AI summary step; the full project review lives there. */
  onOpenSummary?: () => void;
  /** Full-screen mode: centre the conversation in a readable column. */
  wide?: boolean;
}

/** The advisor conversation: example questions, the messages with their sources, and the question box. */
export function AdvisorChat({ ai, ready, suggestions, draft, onDraftChange, inputRef, onOpenSummary, wide = false }: AdvisorChatProps) {
  const { t } = useI18n();
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const messages = ai?.messages;
  const streaming = Boolean(ai?.chatStreaming);
  const [announcement, setAnnouncement] = useState('');
  const wasStreaming = useRef(false);

  // Follow a streaming reply only while the reader is at the bottom; someone scrolled up to re-read is left there.
  const shownCount = useRef(0);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const count = messages?.length ?? 0;
    const asked = count > shownCount.current;
    shownCount.current = count;
    const nearBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    if (asked || nearBottom) endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages]);

  // Screen readers hear that a reply is ready once, not every word as it streams in.
  useEffect(() => {
    if (wasStreaming.current && !streaming) setAnnouncement(t('ws.replyReady'));
    if (streaming) setAnnouncement('');
    wasStreaming.current = streaming;
  }, [streaming, t]);

  if (!ai) {
    return (
      <Notice>
        <div className="max-w-xs">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <LogIn className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">{t('ai.needLogin')}</p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/login" state={{ from: '/visualizer' }}>
              {t('summary.signIn')}
            </Link>
          </Button>
        </div>
      </Notice>
    );
  }
  if (ai.status && !ai.status.enabled) {
    return (
      <Notice>
        <AiNotConfigured />
      </Notice>
    );
  }
  if (!ready) {
    return (
      <Notice>
        <p className="max-w-xs text-sm text-muted-foreground">{t('ai.needSetup')}</p>
      </Notice>
    );
  }

  const send = (text: string) => {
    if (!text.trim()) return;
    void ai.sendChat(text);
    onDraftChange('');
  };
  const column = cn('w-full', wide && 'mx-auto max-w-3xl');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollerRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <section aria-label={t('ai.chatTitle')} className={cn(column, 'space-y-4 p-4', wide && 'sm:p-6')}>
          {ai.messages.length === 0 ? (
            <div className="px-1 py-2 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <MessageCircle className="h-5 w-5" />
              </span>
              <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">{t('ai.chatIntro')}</p>
              <p className="eyebrow mt-5">{t('ai.tryAsking')}</p>
              <div className="mt-2 flex flex-col gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-xl border border-border bg-card px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="eyebrow">{t('ai.chatTitle')}</p>
                <Button size="sm" variant="ghost" className="h-9 px-2.5 text-xs text-muted-foreground" onClick={ai.resetChat}>
                  <Trash2 className="mr-1 h-3 w-3" />
                  {t('ai.clearChat')}
                </Button>
              </div>
              {ai.messages.map((message, index) => (
                <MessageBubble key={index} message={message} pending={ai.chatStreaming && index === ai.messages.length - 1} />
              ))}
            </div>
          )}
          {onOpenSummary ? (
            <button
              type="button"
              onClick={onOpenSummary}
              className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-primary hover:bg-accent"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('advisor.seeSummary')}
            </button>
          ) : null}
          <div ref={endRef} />
          <p className="sr-only" role="status">
            {announcement}
          </p>
        </section>
      </div>

      <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur">
        <div className={cn(column, 'px-3 py-3', wide && 'sm:px-6')}>
          {ai.chatError ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-destructive" role="alert">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t(ai.chatError)}
            </p>
          ) : null}
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                // A Hindi or Marathi word still being composed in the keyboard is not sent half-way.
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              placeholder={t('ai.chatPlaceholder')}
              aria-label={t('ai.chatPlaceholder')}
              maxLength={2000}
              rows={1}
              className="min-h-[56px] resize-none rounded-xl py-3.5 pr-14 text-sm"
            />
            {ai.chatStreaming ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute bottom-2 right-2 h-10 w-10 rounded-lg"
                onClick={ai.stopChat}
                aria-label={t('ai.stop')}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button type="submit" size="icon" className="absolute bottom-2 right-2 h-10 w-10 rounded-lg" disabled={!draft.trim()} aria-label={t('ai.send')}>
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </form>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{t('ai.disclaimer')}</p>
        </div>
      </div>
    </div>
  );
}
