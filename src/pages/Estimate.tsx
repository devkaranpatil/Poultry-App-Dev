import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth/AuthModal";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
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
import { formatINRCompact, formatNumber } from "@/lib/format";

type Cases = Record<"base" | ScenarioName, CalculationResult>;
const CASES = ["downside", "base", "upside"] as const;

const fieldClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** A no-account feasibility estimate: the app's own calculator, three cases, every key price editable and sourced. */
export default function Estimate() {
  const { t } = useI18n();
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
  const openAuth = () => {
    setAuthMode("signup");
    setAuthOpen(true);
  };

  const profit = base?.returns.annualProfit ?? 0;
  const price = values ? values[KEY_FIELDS[kind][0].field] : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader onSignup={openAuth} />
      <AuthModal open={authOpen} mode={authMode} onOpenChange={setAuthOpen} onModeChange={setAuthMode} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{t("estimate.title")}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t("estimate.subtitle")}</p>

        <section className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">{t("estimate.state")}</span>
            <select
              className={fieldClass}
              value={config.state}
              onChange={(e) => change({ ...config, state: e.target.value, district: INDIAN_DISTRICTS[e.target.value]?.[0] ?? "" })}
            >
              {INDIAN_STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">{t("estimate.district")}</span>
            <select className={fieldClass} value={config.district} onChange={(e) => change({ ...config, district: e.target.value })}>
              {districts.map((district) => (
                <option key={district}>{district}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">{t("estimate.birdType")}</span>
            <select
              className={fieldClass}
              value={config.birdType}
              onChange={(e) => change(keepCompatible({ ...config, birdType: e.target.value as FarmConfig["birdType"] }))}
            >
              {BIRD_OPTIONS.map(({ value }) => (
                <option key={value} value={value}>
                  {t(optionKey("bird", value))}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {(["length", "width"] as const).map((key) => (
              <label key={key}>
                <span className="mb-1 block text-xs text-muted-foreground">{t(`estimate.${key}`)}</span>
                <input
                  type="number"
                  min={3}
                  max={120}
                  className={fieldClass}
                  value={config[key]}
                  onChange={(e) => change({ ...config, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
        </section>

        {failed && <p className="mt-6 text-sm text-destructive">{t("estimate.error")}</p>}
        {!cases && !failed && <p className="mt-6 text-sm text-muted-foreground">{t("common.loading")}</p>}

        {cases && base && values && (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-3" data-testid="estimate-cases">
              {CASES.map((name) => {
                const r = cases[name].returns;
                return (
                  <div key={name} className={`rounded-2xl border p-4 ${name === "base" ? "border-primary bg-card" : "border-border bg-card/60"}`}>
                    <p className="eyebrow">{t(`estimate.${name}`)}</p>
                    <p className={`mt-2 font-display text-2xl font-bold tabular-nums ${r.annualProfit >= 0 ? "text-foreground" : "text-destructive"}`}>
                      {formatINRCompact(r.annualProfit)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{t("estimate.perYear")}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("estimate.payback")}: {r.paybackYears === null ? t("estimate.paybackNever") : t("estimate.years", { years: formatNumber(r.paybackYears) })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("estimate.breakEven")}: {r.breakEvenPrice === null ? "—" : `₹${formatNumber(r.breakEvenPrice)}`}
                    </p>
                  </div>
                );
              })}
            </section>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("estimate.caseNote", {
                down: Math.abs(SCENARIO_SHIFT.downside.sale * 100),
                downFeed: SCENARIO_SHIFT.downside.feed * 100,
                downMort: SCENARIO_SHIFT.downside.mortalityPoints,
                up: SCENARIO_SHIFT.upside.sale * 100,
                upFeed: Math.abs(SCENARIO_SHIFT.upside.feed * 100),
                upMort: Math.abs(SCENARIO_SHIFT.upside.mortalityPoints),
              })}
            </p>

            {profit < 0 && (
              <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {t("estimate.lossWarning", {
                  amount: formatINRCompact(Math.abs(profit)),
                  breakEven: formatNumber(base.returns.breakEvenPrice ?? 0),
                  price: formatNumber(price),
                })}
              </p>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-border bg-card p-4">
                <h2 className="text-base font-semibold">{t("estimate.capitalTitle")}</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("estimate.birds")}</dt>
                    <dd className="tabular-nums">{formatNumber(base.flock.birds)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("estimate.capital")}</dt>
                    <dd className="tabular-nums">{formatINRCompact(base.cost.capitalCost)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("estimate.workingCapital")}</dt>
                    <dd className="tabular-nums">{formatINRCompact(base.cost.workingCapital.total)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 font-semibold">
                    <dt>{t("estimate.projectCost")}</dt>
                    <dd className="tabular-nums">{formatINRCompact(base.cost.projectCost)}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">{t("estimate.inputsTitle")}</h2>
                  {Object.keys(overrides).length > 0 && (
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOverrides({})}>
                      {t("estimate.reset")}
                    </button>
                  )}
                </div>
                <div className="mt-3 space-y-3">
                  {KEY_FIELDS[kind].map(({ field, unit }) => {
                    const source = sourceFor(field);
                    return (
                      <div key={field} className="text-sm">
                        <label className="flex items-center justify-between gap-3">
                          <span>{t(`assumption.${field}`)}</span>
                          <input
                            type="number"
                            min={0}
                            step={unit === "pct" ? 0.5 : 1}
                            aria-label={t(`assumption.${field}`)}
                            className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right tabular-nums"
                            value={values[field]}
                            onChange={(e) => setOverrides((current) => ({ ...current, [field]: Number(e.target.value) }))}
                          />
                        </label>
                        {source && (
                          <p className="mt-0.5 flex gap-1 text-[11px] leading-snug text-muted-foreground">
                            <Info className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              {source.url ? (
                                <a href={source.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
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

            <section className="mt-8 flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm text-muted-foreground">{t("estimate.saveHint")}</p>
              {isAuthenticated ? (
                <Button asChild>
                  <Link to="/visualizer">
                    {t("landing.openVisualizer")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button onClick={openAuth}>
                  {t("estimate.saveCta")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </section>
            <p className="mt-4 text-xs text-muted-foreground">{t("estimate.disclaimer")}</p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
