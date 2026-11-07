import { Loader2 } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { useI18n } from '@/context/I18nContext';
import { formatINRCompact, formatNumber } from '@/lib/format';
import type { CalculationResult } from '@/types/farm';
import { cn } from '@/lib/utils';

const formatRupees = (value: number) => `₹${formatNumber(value)}`;

/**
 * The four figures a grower and a bank look at, kept on screen on every money step. When an edit changes them they
 * ease to the new value, so the effect of the change is visible wherever it was made.
 */
export function ProjectFigures({ result, refreshing }: { result: CalculationResult; refreshing: boolean }) {
  const { t } = useI18n();
  const { returns, cost } = result;
  const yearsFormat = (value: number) => t('estimate.years', { years: formatNumber(value) });
  const items = [
    { key: 'cost', label: t('ws.figures.cost'), value: <AnimatedNumber value={cost.projectCost} format={formatINRCompact} />, bad: false },
    {
      key: 'profit',
      label: t('ws.figures.profit'),
      value: <AnimatedNumber value={returns.annualProfit} format={formatINRCompact} />,
      bad: returns.annualProfit < 0,
    },
    {
      key: 'payback',
      label: t('ws.figures.payback'),
      value: returns.paybackYears === null ? t('ws.figures.never') : <AnimatedNumber value={returns.paybackYears} format={yearsFormat} />,
      bad: returns.paybackYears === null,
    },
    {
      key: 'breakEven',
      label: t('ws.figures.breakEven'),
      value: returns.breakEvenPrice === null ? '-' : <AnimatedNumber value={returns.breakEvenPrice} format={formatRupees} />,
      bad: false,
    },
  ];

  return (
    <section aria-label={t('ws.figures.title')} data-testid="project-figures" className="shrink-0 border-b border-border bg-card/80">
      <dl className={cn('mx-auto grid max-w-3xl grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 transition-opacity sm:grid-cols-4 sm:px-6', refreshing && 'opacity-60')}>
        {items.map((item) => (
          <div key={item.key} className="min-w-0">
            <dt className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
              {item.label}
              {refreshing && item.key === 'cost' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            </dt>
            <dd className={cn('truncate font-display text-[17px] font-extrabold tabular-nums', item.bad ? 'text-destructive' : 'text-foreground')}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
