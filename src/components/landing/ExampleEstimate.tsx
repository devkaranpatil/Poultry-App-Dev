import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import { calculateFarm } from "@/services/calculation.service";
import { DEFAULT_CONFIG, type CalculationResult } from "@/types/farm";
import { formatINRCompact, formatNumber } from "@/lib/format";
import { useI18n } from "@/context/I18nContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const EXAMPLE = { ...DEFAULT_CONFIG, state: "Maharashtra", district: "Pune" };

/**
 * The landing page's example, worked out by the same calculator the app uses, at the planner's default prices for
 * Maharashtra. It shows a loss when the defaults lose money: the example is never tuned to look good.
 */
export function ExampleEstimate({ className }: { className?: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; result: CalculationResult } | { status: "failed" }>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    calculateFarm(EXAMPLE, {}, controller.signal)
      .then((result) => setState({ status: "ready", result }))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ status: "failed" });
      });
    return () => controller.abort();
  }, []);

  const result = state.status === "ready" ? state.result : null;
  const a = result?.assumptions as unknown as Record<string, number> | undefined;
  const profit = result?.returns.annualProfit ?? 0;
  const payback = result?.returns.paybackYears ?? null;

  return (
    <div className={cn("surface w-full max-w-[19rem] p-4 shadow-elevated", className)} data-testid="example-estimate" aria-busy={state.status === "loading"}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-foreground">{t("landing.previewLabel")}</p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          Pune
        </span>
      </div>

      {state.status === "loading" ? (
        <div className="mt-3 space-y-2" aria-label={t("home.exampleLoading")}>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3.5 w-40" />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      ) : result && a ? (
        <>
          <p className="mt-2 font-display text-[1.75rem] font-extrabold leading-tight tabular-nums text-foreground">{formatINRCompact(result.cost.projectCost)}</p>
          <p className="text-[13px] text-muted-foreground">{t("landing.exampleSub", { birds: formatNumber(result.flock.birds) })}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            <div className={cn("rounded-lg px-2.5 py-2", profit >= 0 ? "bg-accent" : "bg-destructive/10")}>
              <p className="text-muted-foreground">{t("landing.exampleProfit")}</p>
              <p className={cn("font-bold tabular-nums", profit >= 0 ? "text-accent-foreground" : "text-destructive")}>{formatINRCompact(profit)}</p>
            </div>
            <div className="rounded-lg bg-secondary px-2.5 py-2">
              <p className="text-muted-foreground">{t("right.kpiPayback")}</p>
              <p className="font-bold leading-snug text-foreground">
                {payback === null ? t("estimate.paybackNever") : t("estimate.years", { years: formatNumber(payback) })}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-snug text-muted-foreground">
            {t("landing.exampleAssumptions", { sale: formatNumber(a.saleInrPerKg), feed: formatNumber(a.feedInrPerKg), chick: formatNumber(a.chickInr) })}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("landing.exampleUnavailable")}</p>
      )}

      <Link to="/estimate" className="group mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
        {t("landing.exampleTry").replace(/\s*→$/, "")}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
