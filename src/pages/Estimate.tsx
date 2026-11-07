import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Info, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthModal } from "@/components/auth/AuthModal";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { Field, fieldControlClass } from "@/components/system/Field";
import { Money, PageHeader } from "@/components/system/Display";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { calculateFarm } from "@/services/calculation.service";
import {
  BIRD_OPTIONS,
  DEFAULT_CONFIG,
  INDIAN_DISTRICTS,
  INDIAN_STATES,
  keepCompatible,
  optionKey,
  type CalculationResult,
  type FarmConfig,
} from "@/types/farm";
import type { PoultryAssumptions } from "@/lib/poultryFinance";
import { assumptionSource } from "@/lib/poultrySources";
import { KEY_FIELDS, SCENARIO_SHIFT, productOf, scenarioAssumptions, type ScenarioName } from "@/lib/estimateScenarios";
import { saveEstimateHandoff } from "@/lib/estimateHandoff";
import { formatINRCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cases = Record<"base" | ScenarioName, CalculationResult>;
const CASES = ["downside", "base", "upside"] as const;

/** A no-account feasibility estimate: the app's own calculator, three cases, every key price editable and sourced. */
export default function Estimate() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [config, setConfig] = useState<FarmConfig>({ ...DEFAULT_CONFIG, state: "Maharashtra", district: "Pune" });
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [cases, setCases] = useState<Cases | null>(null);
  const [failed, setFailed] = useState(false);

  const kind = productOf(config.birdType);
  const districts = INDIAN_DISTRICTS[config.state] ?? [];

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const base = await calculateFarm(config, overrides as Partial<PoultryAssumptions>, controller.signal);
        const [downside, upside] = await Promise.all(
          (["downside", "upside"] as const).map((name) =>
            calculateFarm(
              config,
              { ...overrides, ...scenarioAssumptions(base.assumptions, config.birdType, name) } as Partial<PoultryAssumptions>,
              controller.signal
            )
          )
        );
        setCases({ base, downside, upside });
        setFailed(false);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFailed(true);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [config, overrides]);

  const base = cases?.base;
  const values = base?.assumptions as unknown as Record<string, number> | undefined;
  const sourceFor = useMemo(
    () => (field: string) => assumptionSource(config.birdType, "independent", field, config.state),
    [config.birdType, config.state]
  );

  const change = (next: FarmConfig) => {
    setConfig(next);
    setOverrides({});
  };

  // "Save and refine": the same farm and prices open in the workspace; sign-up first when there is no account.
  const saveAndRefine = () => {
    saveEstimateHandoff(config, overrides);
    if (isAuthenticated) {
      navigate("/visualizer");
      return;
    }
    setAuthMode("signup");
    setAuthOpen(true);
  };

  const profit = base?.returns.annualProfit ?? 0;
  const price = values ? values[KEY_FIELDS[kind][0].field] : 0;
  const changed = Object.keys(overrides).length;

  const verdict = base ? (
    profit < 0 ? (
      <p role="alert" className="rounded-card border border-destructive/30 bg-destructive/[0.07] p-5 text-[17px] font-semibold leading-relaxed text-destructive">
        {t("estimate.lossWarning", {
          amount: formatINRCompact(Math.abs(profit)),
          breakEven: formatNumber(base.returns.breakEvenPrice ?? 0),
          price: formatNumber(price),
        })}
      </p>
    ) : (
      <p role="status" className="rounded-card border border-primary/25 bg-accent p-5 text-[17px] font-semibold leading-relaxed text-accent-foreground">
        {base.returns.paybackYears === null
          ? t("estimate.profitNoPayback", { amount: formatINRCompact(profit) })
          : t("estimate.profitVerdict", {
              amount: formatINRCompact(profit),
              years: t("estimate.years", { years: formatNumber(base.returns.paybackYears) }),
            })}
      </p>
    )
  ) : null;

  const capitalShare = base && base.cost.projectCost > 0 ? (base.cost.capitalCost / base.cost.projectCost) * 100 : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader onSignup={saveAndRefine} />
      <AuthModal open={authOpen} mode={authMode} onOpenChange={setAuthOpen} onModeChange={setAuthMode} redirectTo="/visualizer" />

      <main className="mx-auto max-w-7xl px-4 pb-32 pt-10 sm:px-6 lg:px-8 lg:pb-20 lg:pt-14">
        <PageHeader title={t("estimate.title")} description={t("estimate.subtitle")} />

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[360px_1fr] lg:gap-10">
          {/* The farm: four questions, the rest follows the planner's defaults for the state. */}
          <section aria-labelledby="estimate-farm" className="surface p-6 lg:sticky lg:top-24">
            <h2 id="estimate-farm" className="font-display text-xl font-extrabold">
              {t("estimate.yourFarm")}
            </h2>
            <div className="mt-5 grid gap-5">
              <Field label={t("estimate.state")} htmlFor="estimate-state">
                <select
                  id="estimate-state"
                  className={fieldControlClass}
                  value={config.state}
                  onChange={(e) => change({ ...config, state: e.target.value, district: INDIAN_DISTRICTS[e.target.value]?.[0] ?? "" })}
                >
                  {INDIAN_STATES.map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("estimate.district")} htmlFor="estimate-district">
                <select id="estimate-district" className={fieldControlClass} value={config.district} onChange={(e) => change({ ...config, district: e.target.value })}>
                  {districts.map((district) => (
                    <option key={district}>{district}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("estimate.birdType")} htmlFor="estimate-bird">
                <select
                  id="estimate-bird"
                  className={fieldControlClass}
                  value={config.birdType}
                  onChange={(e) => change(keepCompatible({ ...config, birdType: e.target.value as FarmConfig["birdType"] }))}
                >
                  {BIRD_OPTIONS.map(({ value }) => (
                    <option key={value} value={value}>
                      {t(optionKey("bird", value))}
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">{t("estimate.shedSize")}</legend>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  {(["length", "width"] as const).map((key) => (
                    <label key={key} className="grid gap-1 text-[13px] text-muted-foreground">
                      {t(`estimate.${key}`)}
                      <input
                        type="number"
                        min={3}
                        max={120}
                        className={fieldControlClass}
                        value={config[key]}
                        onChange={(e) => change({ ...config, [key]: Number(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          {/* What it comes to: the verdict first, then the cases, the money and the prices behind them. */}
          <section aria-labelledby="estimate-results" className="min-w-0" aria-busy={!cases && !failed}>
            <h2 id="estimate-results" className="sr-only">
              {t("estimate.resultsTitle")}
            </h2>

            {failed && (
              <p className="rounded-card border border-destructive/30 bg-destructive/[0.07] p-5 text-[15px] text-destructive">{t("estimate.error")}</p>
            )}

            {!cases && !failed && (
              <div className="space-y-5" aria-label={t("common.loading")}>
                <Skeleton className="h-20 rounded-card" />
                <div className="grid gap-4 md:grid-cols-3">
                  <Skeleton className="h-36 rounded-card" />
                  <Skeleton className="h-36 rounded-card" />
                  <Skeleton className="h-36 rounded-card" />
                </div>
                <Skeleton className="h-64 rounded-card" />
              </div>
            )}

            {cases && base && values && (
              <div className="space-y-6">
                {verdict}

                <div>
                  <div className="grid gap-4 md:grid-cols-[1fr_1.15fr_1fr]" data-testid="estimate-cases">
                    {CASES.map((name) => {
                      const r = cases[name].returns;
                      const isBase = name === "base";
                      return (
                        <div
                          key={name}
                          className={cn(
                            "rounded-card border p-5 transition-colors",
                            isBase ? "border-primary/40 bg-card shadow-card md:-my-2 md:py-7" : "border-border bg-card/60"
                          )}
                        >
                          <p className={cn("text-[13px] font-semibold", isBase ? "text-primary" : "text-muted-foreground")}>{t(`estimate.${name}`)}</p>
                          <p className={cn("mt-2 font-display font-extrabold leading-tight", isBase ? "text-3xl" : "text-2xl")}>
                            <Money value={r.annualProfit} />
                            <span className="ml-1.5 font-sans text-[13px] font-normal text-muted-foreground">{t("estimate.perYear")}</span>
                          </p>
                          <dl className="mt-3 space-y-1 text-[14px]">
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">{t("estimate.payback")}</dt>
                              <dd className="text-right font-semibold">
                                {r.paybackYears === null ? t("estimate.paybackNever") : t("estimate.years", { years: formatNumber(r.paybackYears) })}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">{t("estimate.breakEven")}</dt>
                              <dd className="font-semibold">{r.breakEvenPrice === null ? "-" : `₹${formatNumber(r.breakEvenPrice)}`}</dd>
                            </div>
                          </dl>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                    {t("estimate.caseNote", {
                      down: Math.abs(SCENARIO_SHIFT.downside.sale * 100),
                      downFeed: SCENARIO_SHIFT.downside.feed * 100,
                      downMort: SCENARIO_SHIFT.downside.mortalityPoints,
                      up: SCENARIO_SHIFT.upside.sale * 100,
                      upFeed: Math.abs(SCENARIO_SHIFT.upside.feed * 100),
                      upMort: Math.abs(SCENARIO_SHIFT.upside.mortalityPoints),
                    })}
                  </p>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <section aria-labelledby="estimate-money" className="surface p-6">
                    <h3 id="estimate-money" className="font-display text-lg font-extrabold">
                      {t("estimate.capitalTitle")}
                    </h3>
                    <p className="mt-3 font-display text-3xl font-extrabold">
                      <Money value={base.cost.projectCost} />
                    </p>
                    <p className="text-[13px] text-muted-foreground">{t("estimate.projectCost")}</p>
                    {/* The split between the shed and the first batch, as two shares of one bar. */}
                    <div className="mt-5 flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
                      <span className="bg-primary transition-[width] duration-500" style={{ width: `${capitalShare}%` }} />
                      <span className="flex-1 bg-straw" />
                    </div>
                    <dl className="mt-4 space-y-2.5 text-[15px]">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="flex items-center gap-2 text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                          {t("estimate.capital")}
                        </dt>
                        <dd className="font-semibold">{formatINRCompact(base.cost.capitalCost)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="flex items-center gap-2 text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full bg-straw" aria-hidden="true" />
                          {t("estimate.workingCapital")}
                        </dt>
                        <dd className="font-semibold">{formatINRCompact(base.cost.workingCapital.total)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <dt className="text-muted-foreground">{t("estimate.birds")}</dt>
                        <dd className="font-semibold">{formatNumber(base.flock.birds)}</dd>
                      </div>
                    </dl>
                  </section>

                  <section aria-labelledby="estimate-prices" className="surface p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 id="estimate-prices" className="font-display text-lg font-extrabold">
                        {t("estimate.inputsTitle")}
                      </h3>
                      {changed > 0 && (
                        <Button type="button" variant="ghost" size="sm" className="-mr-2 -mt-1 shrink-0 text-primary" onClick={() => setOverrides({})}>
                          <RotateCcw />
                          {t("estimate.reset")}
                        </Button>
                      )}
                    </div>
                    <div className="mt-4 space-y-4">
                      {KEY_FIELDS[kind].map(({ field, unit }) => {
                        const source = sourceFor(field);
                        const edited = field in overrides;
                        return (
                          <div key={field}>
                            <label className="flex items-center justify-between gap-4 text-[15px]">
                              <span className={cn("font-medium", edited && "text-primary")}>{t(`assumption.${field}`)}</span>
                              <input
                                type="number"
                                min={0}
                                step={unit === "pct" ? 0.5 : 1}
                                aria-label={t(`assumption.${field}`)}
                                className={cn(fieldControlClass, "h-10 w-28 text-right", edited && "border-primary/60 bg-accent/60")}
                                value={values[field]}
                                onChange={(e) => setOverrides((current) => ({ ...current, [field]: Number(e.target.value) }))}
                              />
                            </label>
                            {source && (
                              <p className="mt-1 flex gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                  {source.url ? (
                                    <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                                      {source.document}
                                    </a>
                                  ) : (
                                    source.document
                                  )}
                                  {source.verified ? "" : ` (${t("returns.assumption")})`}
                                </span>
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <section className="hidden items-center justify-between gap-6 rounded-card bg-primary p-6 text-primary-foreground lg:flex">
                  <p className="max-w-2xl text-[15px] leading-relaxed text-primary-foreground/90">{t("estimate.saveHint")}</p>
                  <Button size="lg" onClick={saveAndRefine} className="shrink-0 bg-card text-primary shadow-none hover:bg-card/90">
                    {t("estimate.saveCta")}
                    <ArrowRight />
                  </Button>
                </section>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{t("estimate.disclaimer")}</p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* On phones the next step stays in reach. */}
      {cases && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <Button size="lg" className="w-full" onClick={saveAndRefine}>
            {t("estimate.saveCta")}
            <ArrowRight />
          </Button>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
