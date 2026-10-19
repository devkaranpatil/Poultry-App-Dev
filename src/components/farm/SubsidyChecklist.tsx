import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useI18n } from '@/context/I18nContext';
import { CHECKLIST_SOURCES, buildChecklist, checklistKey, type ChecklistScheme } from '@/lib/subsidyChecklist';

interface SubsidyChecklistProps {
  scheme: ChecklistScheme;
  projectCost: number;
  state: string;
}

const storageKey = (scheme: ChecklistScheme, state: string) => `farm.applyChecklist.${scheme}.${state || 'any'}`;

// Ticks are a per-viewer convenience: kept in this browser only, and the list works without them.
function readTicks(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeTicks(key: string, ticks: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ticks));
  } catch {
    // Storage blocked (private window): ticks last for this visit only.
  }
}

/** The steps to claim the subsidy under the scheme that applies, each from an official source. */
export function SubsidyChecklist({ scheme, projectCost, state }: SubsidyChecklistProps) {
  const { t } = useI18n();
  const steps = useMemo(() => buildChecklist(scheme, projectCost, state), [scheme, projectCost, state]);
  const key = storageKey(scheme, state);
  const [ticks, setTicks] = useState<string[]>(() => readTicks(key));
  useEffect(() => setTicks(readTicks(key)), [key]);

  const toggle = (id: string, checked: boolean) => {
    setTicks((current) => {
      const next = checked ? [...new Set([...current, id])] : current.filter((item) => item !== id);
      writeTicks(key, next);
      return next;
    });
  };
  const done = steps.filter((step) => ticks.includes(step.id)).length;
  const sources = [...new Set(steps.map((step) => step.source))];

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card/60 p-3" aria-label={t('apply.title')} data-testid="subsidy-checklist">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            {t('apply.title')}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(scheme === 'NHB' ? 'apply.hintNhb' : 'apply.hintMidh')}</p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" aria-live="polite">
          {t('apply.progress', { done, total: steps.length })}
        </span>
      </div>
      <ol className="space-y-2">
        {steps.map((step) => {
          const id = `apply-${step.id}`;
          return (
            <li key={step.id} className="flex items-start gap-2">
              <Checkbox
                id={id}
                checked={ticks.includes(step.id)}
                onCheckedChange={(checked) => toggle(step.id, checked === true)}
                className="mt-0.5"
              />
              <label htmlFor={id} className="text-xs leading-snug text-foreground">
                {t(checklistKey(scheme, step), step.vars)}
              </label>
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t('apply.sources')}{' '}
        {sources.map((source, index) => (
          <span key={source}>
            {index > 0 ? '; ' : ''}
            <a href={CHECKLIST_SOURCES[source].url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {CHECKLIST_SOURCES[source].document}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}
