import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils';

export type TermId =
  | 'subsidy'
  | 'netInvestment'
  | 'payback'
  | 'roi'
  | 'dscr'
  | 'emi'
  | 'moratorium'
  | 'margin'
  | 'gutter'
  | 'ridge'
  | 'yield'
  | 'opex'
  | 'mandi'
  | 'riskSim'
  | 'worth';

/**
 * A small "?" beside a word that opens a plain explanation of it. It sits next to a label rather than inside it, so
 * the label still names its input.
 */
export function Explain({ term, label, className }: { term: TermId; label: string; className?: string }) {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
          aria-label={t('ws.whatIs', { term: label })}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 p-3 text-xs leading-relaxed">
        <p className="mb-1 font-semibold text-foreground">{label}</p>
        <p className="text-muted-foreground">{t(`term.${term}`)}</p>
      </PopoverContent>
    </Popover>
  );
}

/** A label with its explanation, for figures and headings. */
export function Labelled({ term, label, className }: { term: TermId; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {label}
      <Explain term={term} label={label} />
    </span>
  );
}
