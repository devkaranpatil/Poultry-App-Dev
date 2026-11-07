import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { calculateFarm } from "@/services/calculation.service";
import { DEFAULT_CONFIG, type CalculationResult } from "@/types/farm";
import { formatINRCompact, formatNumber } from "@/lib/format";
import { useI18n } from "@/context/I18nContext";

const EXAMPLE = { ...DEFAULT_CONFIG, state: "Maharashtra", district: "Pune" };

/**
 * The landing page's example, worked out by the same calculator the app uses, at the planner's default prices for
 * Maharashtra. It shows a loss when the defaults lose money: the example is never tuned to look good.
 */
export function ExampleEstimate() {
  const { t } = useI18n();
  const [result, setResult] = useState<CalculationResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    calculateFarm(EXAMPLE, {}, controller.signal)
      .then(setResult)
      .catch(() => setResult(null));
    return () => controller.abort();
  }, []);

  const a = result?.assumptions as unknown as Record<string, number> | undefined;
  const profit = result?.returns.annualProfit ?? 0;
  const payback = result?.returns.paybackYears ?? null;

  return (
    <div className="surface absolute -bottom-6 left-4 right-4 p-4 shadow-elevated sm:left-auto sm:right-6 sm:w-72" data-testid="example-estimate">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{t("landing.previewLabel")}</p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Pune
        </span>
      </div>
      {result && a ? (
        <>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground">{formatINRCompact(result.cost.projectCost)}</p>
          <p className="text-xs text-muted-foreground">{t("landing.exampleSub", { birds: formatNumber(result.flock.birds) })}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className={profit >= 0 ? "rounded-lg bg-accent px-2.5 py-2" : "rounded-lg bg-destructive/10 px-2.5 py-2"}>
              <p className="text-muted-foreground">{t("landing.exampleProfit")}</p>
              <p className={`font-semibold tabular-nums ${profit >= 0 ? "text-accent-foreground" : "text-destructive"}`}>{formatINRCompact(profit)}</p>
            </div>
            <div className="rounded-lg bg-muted px-2.5 py-2">
              <p className="text-muted-foreground">{t("right.kpiPayback")}</p>
              <p className="font-semibold tabular-nums text-foreground">
                {payback === null ? t("estimate.paybackNever") : t("estimate.years", { years: formatNumber(payback) })}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            {t("landing.exampleAssumptions", { sale: formatNumber(a.saleInrPerKg), feed: formatNumber(a.feedInrPerKg), chick: formatNumber(a.chickInr) })}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t("landing.exampleUnavailable")}</p>
      )}
      <Link to="/estimate" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
        {t("landing.exampleTry")}
      </Link>
    </div>
  );
}
