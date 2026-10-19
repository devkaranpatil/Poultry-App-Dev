import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Lightbulb, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils';
import { OPTIONAL_STEPS, STEPS, STEP_ICONS, nextStep, previousStep, stepIndex, type StepId } from './steps';

interface StepPageProps {
  step: StepId;
  onNavigate: (step: StepId) => void;
  /** The plain-language bottom line; omitted while there is nothing to say. */
  inShort?: ReactNode;
  /** Dims the page while the figures refresh after an edit. */
  refreshing?: boolean;
  children: ReactNode;
}

/** One step of the journey: what it answers, the bottom line, the detail, and the way on. */
export function StepPage({ step, onNavigate, inShort, refreshing = false, children }: StepPageProps) {
  const { t } = useI18n();
  const Icon = STEP_ICONS[step];
  const back = previousStep(step);
  const next = nextStep(step);

  return (
    <div className="custom-scrollbar h-full overflow-y-auto" data-testid={`step-${step}`}>
      {/* Bottom padding keeps Back/Next clear of the floating advisor button. */}
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        <header className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground sm:flex">
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('ws.stepOf', { n: stepIndex(step) + 1, total: STEPS.length })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-foreground">{t(`ws.steps.${step}`)}</h1>
              {OPTIONAL_STEPS.has(step) ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('ws.optional')}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t(`ws.question.${step}`)}</p>
          </div>
        </header>

        {inShort ? (
          <section
            aria-label={t('ws.inShort')}
            className={cn('rounded-2xl border border-primary/20 bg-accent/60 p-4 sm:p-5', refreshing && 'opacity-60')}
            data-testid="in-short"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-foreground">
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
              {t('ws.inShort')}
            </p>
            <div className="space-y-1.5 text-[15px] leading-relaxed text-foreground">{inShort}</div>
          </section>
        ) : null}

        <div className={cn('space-y-6 transition-opacity', refreshing && 'opacity-60')}>{children}</div>

        <nav className="flex items-center justify-between gap-3 border-t border-border pt-5" aria-label={t('ws.stepsNav')}>
          {back ? (
            <Button variant="outline" onClick={() => onNavigate(back)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t('ws.back')}
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button onClick={() => onNavigate(next)}>
              {t('ws.next', { step: t(`ws.steps.${next}`) })}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : null}
        </nav>
      </div>
    </div>
  );
}

/** Shown on a money step before the design is complete. */
export function FinishDesignFirst({ missing, onGoDesign }: { missing: string[]; onGoDesign: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
      <p className="text-base font-semibold text-foreground">{t('ws.finishSetupTitle')}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('ws.finishSetupDesc')}</p>
      {missing.length > 0 ? <p className="mt-3 text-xs text-muted-foreground">{t('ws.missing', { items: missing.join(', ') })}</p> : null}
      <Button className="mt-4" onClick={onGoDesign}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {t('ws.goDesign')}
      </Button>
    </div>
  );
}

/** A calculation failed: say so plainly and offer to try again. */
export function StepError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
      <p className="text-sm font-medium text-destructive">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('right.correctConfig')}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
        {t('right.retryCalculation')}
      </Button>
    </div>
  );
}

/** A row of headline figures. */
export function Figures({ items }: { items: Array<{ label: ReactNode; value: string; tone?: 'primary' | 'bad' | 'good'; key: string }> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.key}
          className={cn('rounded-xl border px-4 py-3', item.tone === 'primary' ? 'border-primary/20 bg-accent' : 'border-border bg-card')}
        >
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              'kpi-value mt-1 text-lg sm:text-xl',
              item.tone === 'primary' && 'text-accent-foreground',
              item.tone === 'bad' && 'text-destructive',
              item.tone === 'good' && 'text-primary'
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A titled block inside a step. */
export function Block({ title, description, action, children }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
