import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Loader2, LogIn, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/context/I18nContext';
import type { AiAssistant } from '@/hooks/useAiAssistant';
import { cn } from '@/lib/utils';
import { AdvisorReview, AiNotConfigured } from '@/components/advisor/AdvisorReview';
import { aiSummaryState } from '@/components/advisor/summaryState';
import { StepPage } from './StepPage';
import type { StepId } from './steps';

interface SummaryStepProps {
  step: StepId;
  onNavigate: (step: StepId) => void;
  /** Missing when the user is signed out. */
  ai?: AiAssistant;
  /** The user's choice; only takes effect once a current summary exists. */
  includeAiSummary: boolean;
  onIncludeAiSummaryChange: (next: boolean) => void;
}

function SkipButton({ onNavigate }: { onNavigate: (step: StepId) => void }) {
  const { t } = useI18n();
  return (
    <Button variant="ghost" onClick={() => onNavigate('report')} data-testid="summary-skip">
      {t('summary.skip')}
      <ArrowRight className="ml-1.5 h-4 w-4" />
    </Button>
  );
}

/** The optional AI summary, written and checked here before the report decides whether to carry it. */
export function SummaryStep({ step, onNavigate, ai, includeAiSummary, onIncludeAiSummaryChange }: SummaryStepProps) {
  const { t } = useI18n();
  const state = aiSummaryState(ai, includeAiSummary);
  const inShort = <p>{t(state === 'included' ? 'ws.short.summaryIncluded' : state === 'excluded' ? 'ws.short.summaryExcluded' : 'ws.short.summary')}</p>;

  if (!ai) {
    return (
      <StepPage step={step} onNavigate={onNavigate} inShort={inShort}>
        <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center" data-testid="summary-sign-in">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <LogIn className="h-5 w-5" />
          </span>
          <p className="mt-3 text-base font-semibold text-foreground">{t('summary.signInTitle')}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('summary.signInDesc')}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/login" state={{ from: '/visualizer' }}>
                {t('summary.signIn')}
              </Link>
            </Button>
            <SkipButton onNavigate={onNavigate} />
          </div>
        </section>
      </StepPage>
    );
  }

  if (ai.status && !ai.status.enabled) {
    return (
      <StepPage step={step} onNavigate={onNavigate} inShort={inShort}>
        <AiNotConfigured />
        <div className="flex justify-center">
          <SkipButton onNavigate={onNavigate} />
        </div>
      </StepPage>
    );
  }

  const fresh = state === 'included' || state === 'excluded';
  const includeHint = fresh ? t('summary.includeHint') : state === 'stale' ? t('summary.includeNeedsRefresh') : t('summary.includeNeedsSummary');

  return (
    <StepPage step={step} onNavigate={onNavigate} inShort={inShort}>
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{t('summary.whatTitle')}</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{t('summary.whatDesc')}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => void ai.generateAdvisor()} disabled={ai.advisorLoading}>
            {ai.advisorLoading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : ai.advisor ? (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {ai.advisor ? t('summary.regenerate') : t('summary.generate')}
          </Button>
          {fresh ? null : <SkipButton onNavigate={onNavigate} />}
        </div>
      </section>

      {ai.advisorError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-sm text-destructive">{t(ai.advisorError)}</p>
          <Button size="sm" variant="outline" onClick={() => void ai.generateAdvisor()} disabled={ai.advisorLoading}>
            {t('summary.retry')}
          </Button>
        </div>
      ) : null}

      {state === 'stale' ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground" data-testid="summary-stale">
          {t('summary.stale')}
        </p>
      ) : null}

      {ai.advisorLoading && !ai.advisor ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-busy="true">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('summary.generating')}
          </p>
          {[80, 95, 70, 88].map((width) => (
            <div key={width} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />
          ))}
        </section>
      ) : ai.advisor ? (
        <section
          aria-label={t('ws.steps.summary')}
          aria-busy={ai.advisorLoading}
          className={cn('rounded-2xl border border-border bg-card p-4 transition-opacity sm:p-5', (ai.advisorLoading || state === 'stale') && 'opacity-60')}
          data-testid="summary-review"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">{t('ws.steps.summary')}</h2>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">{t('summary.aiLabel')}</span>
          </div>
          <AdvisorReview report={ai.advisor} />
          <p className="mt-4 text-[11px] leading-snug text-muted-foreground">{t('ai.disclaimer')}</p>
        </section>
      ) : null}

      <label
        htmlFor="summary-include"
        className={cn('flex items-start gap-3 rounded-2xl border border-border bg-background p-4', fresh ? 'cursor-pointer' : 'opacity-70')}
      >
        <Switch
          id="summary-include"
          checked={state === 'included'}
          disabled={!fresh}
          onCheckedChange={onIncludeAiSummaryChange}
          aria-labelledby="summary-include-label"
          aria-describedby="summary-include-hint"
          className="mt-0.5"
        />
        <span>
          <span id="summary-include-label" className="block text-sm font-medium text-foreground">
            {t('summary.include')}
          </span>
          <span id="summary-include-hint" className="block text-xs text-muted-foreground">
            {includeHint}
          </span>
        </span>
      </label>
    </StepPage>
  );
}
