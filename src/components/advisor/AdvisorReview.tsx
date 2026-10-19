import { Bot } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import type { AdvisorReport } from '@/services/ai.service';
import { cn } from '@/lib/utils';

const VERDICT_STYLES: Record<AdvisorReport['verdict'], string> = {
  strong: 'bg-primary text-primary-foreground',
  viable: 'bg-accent text-accent-foreground',
  marginal: 'bg-warning/15 text-warning',
  weak: 'bg-destructive/10 text-destructive',
};

const SEVERITY_DOT: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-muted-foreground/50',
  medium: 'bg-warning',
  high: 'bg-destructive',
};

/** The server has no AI model installed: say so instead of failing on every request. */
export function AiNotConfigured() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center">
      <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-foreground">{t('ai.notConfiguredTitle')}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('ai.notConfiguredDesc')}</p>
    </div>
  );
}

/** The AI's verdict, strengths, risks and recommendations for the project. */
export function AdvisorReview({ report }: { report: AdvisorReport }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', VERDICT_STYLES[report.verdict])}>
          {t(`ai.verdict.${report.verdict}`)}
        </span>
        <p className="text-sm leading-relaxed text-foreground">{report.summary}</p>
      </div>

      {report.strengths.length > 0 ? (
        <div>
          <p className="eyebrow mb-2">{t('ai.strengths')}</p>
          <ul className="space-y-1.5">
            {report.strengths.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.risks.length > 0 ? (
        <div>
          <p className="eyebrow mb-2">{t('ai.risks')}</p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {report.risks.map((risk) => (
              <li key={risk.title} className="p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[risk.severity])} aria-hidden="true" />
                  {risk.title}
                  <span className="ml-auto text-[11px] font-normal text-muted-foreground">{t(`ai.severity.${risk.severity}`)}</span>
                </p>
                <p className="mt-1 pl-4 text-xs leading-relaxed text-muted-foreground">{risk.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.recommendations.length > 0 ? (
        <div>
          <p className="eyebrow mb-2">{t('ai.recommendations')}</p>
          <ol className="divide-y divide-border rounded-lg border border-border bg-card">
            {report.recommendations.map((rec, index) => (
              <li key={rec.title} className="flex items-start gap-3 p-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{rec.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{rec.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{t(`ai.category.${rec.category}`)}</span>
                    {rec.impact ? <span className="font-medium text-primary">{rec.impact}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
