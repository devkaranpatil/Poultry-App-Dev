import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils';
import { OPTIONAL_STEPS, STEPS, STEP_ICONS, type StepId } from './steps';

interface StepBarProps {
  current: StepId;
  onSelect: (step: StepId) => void;
  /** Steps after Design only have figures once the design is complete. */
  designComplete: boolean;
  /** Steps the user has opened, ticked so progress is visible. */
  visited: ReadonlySet<StepId>;
}

/** The journey along the top: where you are, what is done, and what comes next. */
export function StepBar({ current, onSelect, designComplete, visited }: StepBarProps) {
  const { t } = useI18n();
  const activeRef = useRef<HTMLButtonElement>(null);

  // On a phone the bar scrolls sideways: keep the current step in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [current]);

  return (
    <div role="tablist" aria-label={t('ws.stepsNav')} className="no-scrollbar flex items-center overflow-x-auto">
      {STEPS.map((step, index) => {
        const Icon = STEP_ICONS[step];
        const active = step === current;
        const locked = step !== 'design' && !designComplete;
        const done = !active && designComplete && visited.has(step);
        const optional = OPTIONAL_STEPS.has(step);
        return (
          <div key={step} className="flex shrink-0 items-center">
            {index > 0 ? <span className="mx-0.5 h-px w-3 bg-border lg:w-4" aria-hidden="true" /> : null}
            <button
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={t(`ws.steps.${step}`)}
              aria-description={optional ? t('ws.optional') : undefined}
              id={`step-tab-${step}`}
              onClick={() => onSelect(step)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                locked && !active && 'opacity-60'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  active ? 'bg-primary-foreground/20' : done ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'
                )}
                aria-hidden="true"
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <Icon className="hidden h-4 w-4 2xl:block" aria-hidden="true" />
              <span aria-hidden="true">{t(`ws.steps.${step}`)}</span>
              {optional ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-wide',
                    active ? 'bg-primary-foreground/20 text-primary-foreground' : 'border border-border text-muted-foreground'
                  )}
                  aria-hidden="true"
                  data-testid="step-optional"
                >
                  {t('ws.optional')}
                </span>
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}
