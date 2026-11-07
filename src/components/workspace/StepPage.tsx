import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Lightbulb, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils';
import { OPTIONAL_STEPS, STEP_ICONS, nextStep, previousStep, type StepId } from './steps';

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
      {/* Bottom room on larger screens lets the last figures scroll clear of the ask box in the corner. */}
      <div className="mx-auto w-full max-w-3xl space-y-7 px-4 pt-6 sm:px-6 sm:pt-10 md:pb-44">
        <header className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-card bg-accent text-accent-foreground sm:flex">
            <Icon className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="step-heading" tabIndex={-1} className="font-display text-[1.75rem] font-extrabold leading-tight text-foreground outline-none sm:text-[2rem]">
                {t(`ws.steps.${step}`)}
              </h1>
              {OPTIONAL_STEPS.has(step) ? (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[12px] font-semibold text-muted-foreground">{t('ws.optional')}</span>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-[60ch] text-[16px] leading-relaxed text-muted-foreground">{t(`ws.question.${step}`)}</p>
          </div>
        </header>

        {inShort ? (
          <section
            aria-label={t('ws.inShort')}
            className={cn('rounded-card border border-primary/20 bg-accent/60 p-5 transition-opacity', refreshing && 'opacity-60')}
            data-testid="in-short"
          >
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-accent-foreground">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
              {t('ws.inShort')}
            </p>
            <div className="space-y-1.5 text-[16px] leading-relaxed text-foreground">{inShort}</div>
          </section>
        ) : null}

        <div className={cn('space-y-8 transition-opacity', refreshing && 'opacity-60')}>{children}</div>

        {/* On a phone Back and Next stay at the bottom of the screen, where the thumb is. */}
        <nav
          className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:static md:mx-0 md:bg-transparent md:px-0 md:pb-0 md:pt-6 md:backdrop-blur-none"
          aria-label={t('ws.pageNav')}
        >
          {back ? (
            <Button variant="outline" size="lg" className="h-12 md:h-11" onClick={() => onNavigate(back)}>
              <ArrowLeft />
              {t('ws.back')}
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button size="lg" className="h-12 min-w-0 flex-1 md:h-11 md:flex-none" onClick={() => onNavigate(next)}>
              <span className="truncate">{t('ws.next', { step: t(`ws.steps.${next}`) })}</span>
              <ArrowRight />
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
    <div className="rounded-card border border-dashed border-input bg-card p-8 text-center">
      <p className="font-display text-lg font-extrabold text-foreground">{t('ws.finishSetupTitle')}</p>
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
    <div className="rounded-card border border-destructive/30 bg-destructive/[0.06] p-6 text-center">
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
          className={cn('rounded-card border px-4 py-3.5', item.tone === 'primary' ? 'border-primary/25 bg-accent' : 'border-border bg-card shadow-soft')}
        >
          <dt className="text-[13px] font-medium leading-snug text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              'kpi-value mt-1 text-lg leading-tight sm:text-xl',
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
          <h2 className="font-display text-lg font-extrabold leading-snug text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
