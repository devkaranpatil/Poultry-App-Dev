import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, Landmark, MapPin, Ruler, Thermometer, XCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useI18n } from '@/context/I18nContext';
import { formatINR, formatINRCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { HeatStress, NabardComparison, ReferenceContext, SchemesResult, SchemeStatus, SitingRule } from '@/types/farm';

const SourceLink = ({ url, children }: { url: string | null; children: string }) =>
  url ? (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  ) : (
    <span>{children}</span>
  );

/** The district's own climate from NASA POWER, when the database has it. */
export function DistrictClimateCard({ reference }: { reference: ReferenceContext }) {
  const { t } = useI18n();
  const climate = reference.districtClimate;
  if (!climate) return null;

  return (
    <section className="space-y-1.5 rounded-xl border border-border p-3" aria-label={t('right.districtClimate')}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        {t('right.districtClimate')}
      </p>
      <p className="text-sm text-foreground">
        {t('right.districtClimateRow', {
          temp: climate.annualMeanTempC.toFixed(1),
          rain: formatNumber(climate.annualRainfallMm),
          rh: Math.round(climate.annualHumidityPct),
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('right.districtClimateRange', { mean: climate.hottestMonthMeanC.toFixed(1), max: climate.hottestMonthMaxTempC.toFixed(1), min: climate.coldestMonthMinTempC.toFixed(1) })}
      </p>
      <p className="text-[12px] text-muted-foreground">{t('right.districtClimateNote')}</p>
    </section>
  );
}

/** The temperature-humidity index month by month, with the months of severe stress marked. */
export function HeatStressCard({ heatStress }: { heatStress: HeatStress }) {
  const { t } = useI18n();
  const top = Math.max(heatStress.threshold + 4, ...heatStress.thiByMonth.map((m) => m.thi));
  const bottom = Math.min(15, ...heatStress.thiByMonth.map((m) => m.thi));
  const severe = new Set(heatStress.severeMonths);
  return (
    <section className="space-y-2 rounded-xl border border-border p-3" aria-label={t('heat.title')} data-testid="heat-stress">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Thermometer className="h-3.5 w-3.5 text-primary" />
        {t('heat.title')}
      </p>
      <p className="text-sm text-foreground">
        {heatStress.severeMonths.length > 0
          ? t('heat.severe', { count: heatStress.severeMonths.length, months: heatStress.severeMonths.map((m) => t(`month.${m}`)).join(', ') })
          : t('heat.none')}
      </p>
      <div className="flex h-24 items-end gap-1" role="img" aria-label={t('heat.chart', { threshold: heatStress.threshold })}>
        {heatStress.thiByMonth.map(({ month, thi }) => (
          <div key={month} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn('w-full rounded-t', severe.has(month) ? 'bg-destructive/70' : 'bg-primary/50')}
              style={{ height: `${Math.max(4, ((thi - bottom) / (top - bottom)) * 80)}px` }}
              title={`${t(`month.${month}`)}: THI ${thi}`}
            />
            <span className="text-[9px] text-muted-foreground">{t(`month.${month}`).slice(0, 1)}</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">{t(heatStress.basis === 'district' ? 'heat.noteDistrict' : 'heat.noteState', { threshold: heatStress.threshold })}</p>
    </section>
  );
}

/** Your cost against the NABARD unit cost for the same flock, the cost norm a bank or scheme recognises. */
export function NabardCard({ nabard }: { nabard: NabardComparison }) {
  const { t } = useI18n();
  const above = nabard.ownCostInr > nabard.normCostInr;
  return (
    <section className="space-y-2 rounded-xl border border-border bg-muted/30 p-3" aria-label={t('nabard.title')} data-testid="nabard-card">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Landmark className="h-3.5 w-3.5 text-primary" />
        {t('nabard.title')}
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">
            {nabard.perBirdNorm
              ? t('nabard.perBirdNorm', { perBird: formatINR(nabard.perBirdInr) })
              : t('nabard.norm', { birds: formatNumber(nabard.unitBirds), perBird: formatINR(nabard.perBirdInr) })}
          </dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatINR(nabard.normCostInr)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('nabard.yours')}</dt>
          <dd className={cn('font-semibold tabular-nums', above ? 'text-warning' : 'text-foreground')}>{formatINR(nabard.ownCostInr)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{t(above ? 'nabard.above' : 'nabard.within', { recognised: formatINR(nabard.recognisedCostInr) })}</p>
      {nabard.note ? <p className="text-xs text-muted-foreground">{t('nabard.controlledNote')}</p> : null}
      {nabard.capitalOnly ? <p className="text-xs text-muted-foreground">{t('nabard.capitalOnly')}</p> : null}
      {nabard.otherState ? <p className="text-xs text-muted-foreground">{t('nabard.otherState', { state: nabard.state })}</p> : null}
      <p className="text-[12px] text-muted-foreground">
        <SourceLink url={nabard.source.url}>{`${nabard.source.document} (${nabard.state}, ${nabard.year}): ${nabard.system}`}</SourceLink>
      </p>
    </section>
  );
}

const STATUS_ICON: Record<SchemeStatus, typeof CheckCircle2> = { eligible: CheckCircle2, check: CircleHelp, 'not-eligible': XCircle };
const STATUS_STYLE: Record<SchemeStatus, string> = {
  eligible: 'text-primary',
  check: 'text-warning',
  'not-eligible': 'text-muted-foreground',
};

/** Every scheme checked, with its verdict and why; says plainly when none applies. */
export function SchemesCard({ schemes }: { schemes: SchemesResult }) {
  const { t } = useI18n();
  return (
    <section className="space-y-3" aria-label={t('schemes.title')} data-testid="schemes-card">
      {schemes.noneApplies ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground" role="note">
          {t('schemes.none')}
        </p>
      ) : null}
      <ul className="space-y-2">
        {schemes.schemes.map((scheme) => {
          const Icon = STATUS_ICON[scheme.status];
          return (
            <li key={scheme.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', STATUS_STYLE[scheme.status])} aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-foreground">{scheme.name}</p>
                  <p className={cn('text-xs font-medium', STATUS_STYLE[scheme.status])}>
                    {t(`schemes.status.${scheme.status}`)}
                    {scheme.status !== 'not-eligible' && scheme.percent !== null
                      ? ` · ${t('schemes.amount', { percent: scheme.percent, amount: formatINRCompact(scheme.amountInr) })}`
                      : ''}
                    {scheme.interestSubventionPct !== null ? ` · ${t('schemes.subvention', { pct: scheme.interestSubventionPct })}` : ''}
                    {scheme.verified ? '' : ` · ${t('schemes.unverified')}`}
                  </p>
                  {scheme.reasons.length > 0 ? (
                    <ul className="max-w-[72ch] list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {scheme.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  {scheme.status !== 'not-eligible' && scheme.notes.length > 0 ? (
                    <ul className="max-w-[72ch] list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {scheme.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-[12px] text-muted-foreground">
                    <SourceLink url={scheme.source.url}>{scheme.source.document}</SourceLink>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-muted-foreground">{t('schemes.disclaimer')}</p>
    </section>
  );
}

/**
 * The siting and registration rules that apply to this farm, as a checklist the farmer ticks. Anything left unticked
 * becomes a warning in the report.
 */
export function SitingChecklist({
  rules,
  ticked,
  onTickedChange,
}: {
  rules: SitingRule[];
  ticked: Record<string, boolean>;
  onTickedChange: (next: Record<string, boolean>) => void;
}) {
  const { t } = useI18n();
  const open = rules.filter((rule) => !ticked[rule.id]).length;
  return (
    <section className="space-y-2" aria-label={t('siting.title')} data-testid="siting-checklist">
      <ul className="space-y-1.5">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
            <Checkbox
              id={`siting-${rule.id}`}
              checked={Boolean(ticked[rule.id])}
              onCheckedChange={(checked) => onTickedChange({ ...ticked, [rule.id]: checked === true })}
              className="mt-0.5"
            />
            <label htmlFor={`siting-${rule.id}`} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
              <span className="flex flex-wrap items-center gap-x-2 text-sm text-foreground">
                {rule.description}
                {rule.distanceM !== null ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium tabular-nums text-muted-foreground">
                    <Ruler className="h-3 w-3" />
                    {t('siting.distance', { m: formatNumber(rule.distanceM) })}
                  </span>
                ) : null}
              </span>
              <span className="block text-[12px] text-muted-foreground">
                {t(`siting.appliesTo.${rule.appliesTo.replace(/\s+/g, '-')}`)} · <SourceLink url={rule.source.url}>{rule.source.document}</SourceLink>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {open > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-warning" role="status">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t('siting.open', { count: open })}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-primary" role="status">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('siting.allTicked')}
        </p>
      )}
    </section>
  );
}
