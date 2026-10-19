import { AlertTriangle, ExternalLink, Landmark, MapPin, Store } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { formatINR, formatNumber } from '@/lib/format';
import type { ReferenceContext } from '@/types/greenhouse';

/** Government cost norm, subsidy estimate and area-limit check, from the official NHB/MIDH documents. */
export function GovernmentNormCard({ reference }: { reference: ReferenceContext }) {
  const { t } = useI18n();
  const { governmentNorm, indicativeSubsidy, areaLimit } = reference;
  if (!governmentNorm && !areaLimit) return null;

  return (
    <section className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-3" aria-label={t('right.normTitle')}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Landmark className="h-3.5 w-3.5 text-primary" />
        {t('right.normTitle')}
      </p>

      {governmentNorm ? (
        <div className="space-y-1 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">
              {t('right.normOfficial', { perSqm: formatINR(governmentNorm.normPerSqmInr) })}
            </span>
            <span className="font-medium tabular-nums text-foreground">{formatINR(governmentNorm.normCostInr)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">{t('right.normYours')}</span>
            <span className="font-medium tabular-nums text-foreground">{formatINR(governmentNorm.yourStructureAndCoverInr)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('right.normHint')}</p>
        </div>
      ) : null}

      {indicativeSubsidy ? (
        <div className="rounded-lg bg-accent px-3 py-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-accent-foreground">{t('right.subsidyIndicative', { percent: indicativeSubsidy.percent })}</span>
            <span className="font-semibold tabular-nums text-accent-foreground">{formatINR(indicativeSubsidy.amountInr)}</span>
          </div>
          {indicativeSubsidy.cappedAtInr ? (
            <p className="mt-1 text-[11px] text-accent-foreground/80">{t('right.subsidyCapped', { cap: formatINR(indicativeSubsidy.cappedAtInr) })}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-accent-foreground/80">
            {t(indicativeSubsidy.scheme === 'NHB' ? 'right.subsidyNhb' : 'right.subsidyNhm', { limit: formatNumber(areaLimit?.limitSqm ?? 4000) })}
          </p>
        </div>
      ) : null}

      {areaLimit ? (
        areaLimit.exceedsLimit ? (
          <p className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            {t('right.areaLimitExceeded', { limit: formatNumber(areaLimit.limitSqm), date: areaLimit.effectiveFrom })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('right.areaLimitOk', { limit: formatNumber(areaLimit.limitSqm) })}</p>
        )
      ) : null}

      {governmentNorm ? (
        <a
          href={governmentNorm.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          {t('right.normSource')}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </section>
  );
}

/** The district's own climate (NASA POWER), shown beside the state profile the cost model uses. */
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
      <p className="text-[11px] text-muted-foreground">{t('right.districtClimateNote')}</p>
    </section>
  );
}

/** Today's mandi prices for the suggested crops, with a rough sale value for this floor area. */
export function MarketPricesCard({ reference, stateName }: { reference: ReferenceContext; stateName: string }) {
  const { t } = useI18n();
  const prices = reference.marketPrices ?? [];
  if (prices.length === 0) return null;

  return (
    <section className="space-y-2 rounded-xl border border-border p-3" aria-label={t('right.marketTitle')}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Store className="h-3.5 w-3.5 text-primary" />
        {t('right.marketTitle')}
      </p>
      <ul className="space-y-2">
        {prices.map((p) => {
          const shown = p.state && p.state.markets >= 3 ? p.state : p.india;
          const scope = shown === p.state ? stateName : t('right.marketIndia');
          return (
            <li key={p.crop} className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">{p.crop}</span>
                {shown ? (
                  <span className="tabular-nums text-foreground">
                    {t('right.marketPerQuintal', { price: formatINR(shown.medianInrPerQuintal) })}
                  </span>
                ) : null}
              </div>
              {shown ? (
                <p className="text-[11px] text-muted-foreground">
                  {t('right.marketRange', {
                    scope,
                    low: formatINR(shown.lowInrPerQuintal),
                    high: formatINR(shown.highInrPerQuintal),
                    markets: shown.markets,
                  })}
                </p>
              ) : null}
              {p.revenue ? (
                <p className="mt-1 text-xs text-foreground">
                  {t('right.marketRevenue', { low: formatINR(p.revenue.lowInr), high: formatINR(p.revenue.highInr) })}
                </p>
              ) : null}
              {p.stale ? <p className="text-[11px] text-warning">{t('right.marketStale', { date: p.date })}</p> : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">{t('right.marketNote', { date: prices[0].date })}</p>
    </section>
  );
}
