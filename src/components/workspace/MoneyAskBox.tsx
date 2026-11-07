import { useId, useState } from 'react';
import { ArrowUp, Bot, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils';
import type { StepId } from './steps';

const FOLDED_KEY = 'farm.askBoxFolded';

function readFolded() {
  try {
    return window.localStorage.getItem(FOLDED_KEY) === '1';
  } catch {
    return false;
  }
}

interface MoneyAskBoxProps {
  step: StepId;
  /** Opens the advisor; with a question, asks it straight away. */
  onAsk: (question?: string) => void;
  /** A reply finished while the advisor was closed. */
  unread: boolean;
  /** Phone: only a small button above Back and Next, so the figures keep the screen. */
  compact: boolean;
}

/**
 * A small box in the corner of the money steps (cost, earnings, loan, risk), where questions about the figures come
 * up: type one or pick the suggestion, and the advisor opens with it. It folds to a button and remembers that.
 */
export function MoneyAskBox({ step, onAsk, unread, compact }: MoneyAskBoxProps) {
  const { t } = useI18n();
  const [folded, setFolded] = useState(readFolded);
  const [question, setQuestion] = useState('');
  const inputId = useId();
  const suggestion = t(`ai.suggest.${step}.1`);

  const fold = (next: boolean) => {
    setFolded(next);
    try {
      window.localStorage.setItem(FOLDED_KEY, next ? '1' : '0');
    } catch {
      // Not remembered; it still folds for this visit.
    }
  };

  const ask = (text?: string) => {
    onAsk(text?.trim() || undefined);
    setQuestion('');
  };

  if (compact || folded) {
    return (
      <button
        type="button"
        onClick={() => (compact ? ask() : fold(false))}
        data-testid="money-ask"
        className={cn(
          't-ask-in absolute right-4 z-20 inline-flex h-11 items-center gap-2 rounded-full bg-primary pl-3.5 pr-4 text-[14px] font-semibold text-primary-foreground shadow-lg transition-transform active:scale-[0.97] md:right-6',
          compact ? 'bottom-[calc(env(safe-area-inset-bottom)+88px)]' : 'bottom-6'
        )}
      >
        <Bot className="h-[18px] w-[18px]" aria-hidden="true" />
        {t('advisor.ask')}
        {unread ? (
          <span className="h-2 w-2 rounded-full bg-primary-foreground" aria-label={t('ws.replyReady')} data-testid="advisor-unread" />
        ) : null}
      </button>
    );
  }

  return (
    <section
      aria-label={t('ws.askBoxTitle')}
      data-testid="money-ask"
      className="t-ask-in absolute bottom-6 right-6 z-20 w-[300px] rounded-card border border-border bg-card p-3 shadow-[0_12px_32px_-12px_hsl(160_30%_10%/0.35)]"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
          <Bot className="h-4 w-4" />
        </span>
        <label htmlFor={inputId} className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">
          {t('ws.askBoxTitle')}
        </label>
        {unread ? (
          <button
            type="button"
            onClick={() => ask()}
            className="rounded-full bg-primary px-2 text-[12px] font-semibold leading-6 text-primary-foreground"
          >
            {t('ws.replyReady')}
          </button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={() => fold(true)}
          aria-label={t('ws.askBoxHide')}
          title={t('ws.askBoxHide')}
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => ask(suggestion)}
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-[13px] leading-snug text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
      >
        {suggestion}
      </button>

      <form
        className="relative mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <input
          id={inputId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t('ws.askBoxPlaceholder')}
          maxLength={2000}
          className="h-11 w-full rounded-lg border border-input bg-background pl-3 pr-12 text-[14px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" className="absolute right-1.5 top-1.5 h-8 w-8 rounded-md" aria-label={t('ai.send')}>
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </section>
  );
}
