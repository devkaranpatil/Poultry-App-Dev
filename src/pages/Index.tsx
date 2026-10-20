import { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Box, CheckCircle2, FolderOpen, HelpCircle, LayoutDashboard, Share2, SlidersHorizontal } from 'lucide-react';
import { DesignSidebar, type DesignTab } from '@/components/farm/DesignSidebar';
import type { EditablePart } from '@/lib/sceneEdit';
import { SavedSetupsDialog } from '@/components/farm/SavedSetupsDialog';
import { StepBar } from '@/components/workspace/StepBar';
import { StepViews } from '@/components/workspace/StepViews';
import { WelcomeGuide } from '@/components/workspace/WelcomeGuide';
import { AdvisorWidget } from '@/components/advisor/AdvisorWidget';
import { hasSeenGuide } from '@/lib/guideStorage';
import { type StepId } from '@/components/workspace/steps';
import {
  FarmConfig,
  DEFAULT_CONFIG,
  SetupSectionProgress,
  normalizeFarmConfig,
  clampDimension,
} from '@/types/farm';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { calculationKey, useFarmCalculations } from '@/hooks/useFarmCalculations';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { TopRightMenu } from '@/components/TopRightMenu';
import { Logo } from '@/components/brand/Logo';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { useIsMobile } from '@/hooks/use-mobile';
import { SHARE_PARAM, buildShareUrl, decodeShareParam, loadDraft, saveDraft } from '@/lib/configPersistence';
import { defaultPoultryAssumptions, type PoultryAssumptions } from '@/lib/poultryFinance';
import { poultryLoanTerms, type LoanTerms } from '@/lib/loan';
import { formatINRCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const MiddlePanel = lazy(async () => {
  const module = await import('@/components/farm/MiddlePanel');
  return { default: module.MiddlePanel };
});

const EMPTY_CONFIG: FarmConfig = normalizeFarmConfig({
  ...DEFAULT_CONFIG,
  length: 0,
  width: 0,
  eavesHeight: 0,
  ridgeHeight: 0,
  state: '',
  district: '',
});

/** Debounce before results refresh automatically after an edit. */
const AUTO_CALCULATE_DELAY_MS = 600;

type InitialSource = 'shared' | 'draft' | 'empty';
type MobileDesignView = 'setup' | 'model';

function readInitialConfig(): { config: FarmConfig; source: InitialSource } {
  const shared = decodeShareParam(new URLSearchParams(window.location.search).get(SHARE_PARAM));
  if (shared) return { config: shared, source: 'shared' };
  const draft = loadDraft();
  if (draft && JSON.stringify(draft) !== JSON.stringify(EMPTY_CONFIG)) return { config: draft, source: 'draft' };
  return { config: EMPTY_CONFIG, source: 'empty' };
}

const Index = () => {
  const { t, language } = useI18n();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [initial] = useState(readInitialConfig);
  const [config, setConfig] = useState<FarmConfig>(initial.config);
  // Bumped whenever a complete setup arrives from outside the form.
  const [restoredConfigVersion, setRestoredConfigVersion] = useState(initial.source === 'empty' ? 0 : 1);
  const [step, setStep] = useState<StepId>('design');
  const [visited, setVisited] = useState<ReadonlySet<StepId>>(() => new Set<StepId>(['design']));
  // The part selected on the model and the sidebar tab follow each other, as in Blender.
  const [selectedPart, setSelectedPart] = useState<EditablePart | null>(null);
  const [designTab, setDesignTab] = useState<DesignTab>('size');
  const selectOnModel = useCallback((part: EditablePart | null) => {
    setSelectedPart(part);
    if (part) setDesignTab(part);
  }, []);
  const openDesignTab = useCallback((tab: DesignTab) => {
    setDesignTab(tab);
    setSelectedPart(tab === 'location' ? null : tab);
  }, []);
  const [mobileDesignView, setMobileDesignView] = useState<MobileDesignView>('setup');
  // One switch for the AI summary in the report, shown on the summary step and in the export options.
  const [includeAiSummary, setIncludeAiSummary] = useState(true);
  const [guideOpen, setGuideOpen] = useState(() => initial.source === 'empty' && !hasSeenGuide());
  const [loanTerms, setLoanTerms] = useState<LoanTerms>(() => poultryLoanTerms(initial.config.birdType));
  // The setup form's filled-in fields live here so they survive leaving the Design step.
  const [setupTouched, setSetupTouched] = useState<Record<string, boolean>>({});
  const [, setSectionProgress] = useState<SetupSectionProgress>({ size: false, shed: false, birds: false, location: false });
  const [isConfigValid, setIsConfigValid] = useState(true);
  const [isSavedDialogOpen, setIsSavedDialogOpen] = useState(false);
  // The siting rules the farmer has confirmed on the Site step; the report warns about the rest.
  const [sitingTicks, setSitingTicks] = useState<Record<string, boolean>>({});
  const [financeAssumptions, setFinanceAssumptions] = useState<PoultryAssumptions>(() =>
    defaultPoultryAssumptions(initial.config.birdType, initial.config.farmingModel)
  );

  const { calculate, isLoading, result, error: calculationError, lastCalculatedKey } = useFarmCalculations();
  // A result belongs to a setup and the assumptions it was worked out with: editing a price recalculates too.
  const currentConfigKey = calculationKey(config, financeAssumptions);
  const hasFreshResult = lastCalculatedKey === currentConfigKey;
  const activeResult = hasFreshResult ? result : null;
  const activeCalculationError = hasFreshResult ? calculationError : null;

  // Tell the user where the starting setup came from, then drop the share param
  // so a refresh restores their own (possibly edited) draft instead.
  useEffect(() => {
    if (initial.source === 'shared') {
      toast.success(t('app.sharedLoaded'));
      navigate('/visualizer', { replace: true });
    } else if (initial.source === 'draft') {
      toast(t('app.draftRestored'));
    }
    // Runs once for the initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => saveDraft(config), 300);
    return () => window.clearTimeout(timer);
  }, [config]);

  // Each bird and farming model has its own production figures, prices and loan terms; the counted subsidy carries over.
  const lastFamilyRef = useRef(`${config.birdType}|${config.farmingModel}`);
  useEffect(() => {
    const family = `${config.birdType}|${config.farmingModel}`;
    if (lastFamilyRef.current === family) return;
    const birdChanged = lastFamilyRef.current.split('|')[0] !== config.birdType;
    lastFamilyRef.current = family;
    setFinanceAssumptions((prev) => ({ ...defaultPoultryAssumptions(config.birdType, config.farmingModel), subsidyInr: prev.subsidyInr }));
    if (birdChanged) setLoanTerms(poultryLoanTerms(config.birdType));
  }, [config.birdType, config.farmingModel]);

  const area = config.length * config.width;
  // The 3D scene's geometry scales with the dimensions, so never hand it values
  // beyond the supported limits even while the user is mid-way through typing.
  const modelConfig = useMemo<FarmConfig>(
    () => ({
      ...config,
      length: clampDimension('length', config.length),
      width: clampDimension('width', config.width),
      eavesHeight: clampDimension('eavesHeight', config.eavesHeight),
      ridgeHeight: clampDimension('ridgeHeight', config.ridgeHeight),
    }),
    [config]
  );
  const hasValidHeightRelation = config.ridgeHeight > config.eavesHeight;
  const isModelRenderable = config.length > 0 && config.width > 0;
  const isVisualizerReady =
    config.length > 0 &&
    config.width > 0 &&
    config.eavesHeight > 0 &&
    hasValidHeightRelation &&
    config.state.trim() !== '' &&
    config.district.trim() !== '' &&
    isConfigValid;

  const missingItems = [
    config.length > 0 ? null : t('left.length'),
    config.width > 0 ? null : t('left.width'),
    config.eavesHeight > 0 ? null : t('left.eaves'),
    hasValidHeightRelation ? null : t('left.ridge'),
    config.state.trim() !== '' ? null : t('left.state'),
    config.district.trim() !== '' ? null : t('left.district'),
  ].filter(Boolean) as string[];
  const modelMissingItems = [
    config.length > 0 ? null : t('left.length'),
    config.width > 0 ? null : t('left.width'),
  ].filter(Boolean) as string[];

  const setupProgress = Math.round(((6 - missingItems.length) / 6) * 100);
  // While an automatic refresh is pending, keep showing the previous result
  // (dimmed) instead of flashing empty states on every keystroke.
  const isRefreshing = isVisualizerReady && !hasFreshResult;
  const displayedResult = activeResult ?? (isRefreshing && !calculationError ? result : null);

  const handleCalculate = useCallback(() => {
    void calculate(config, financeAssumptions);
  }, [config, financeAssumptions, calculate]);

  // Keep insights in step with the configuration once it is complete and valid.
  useEffect(() => {
    if (!isVisualizerReady || hasFreshResult) return;
    const timer = window.setTimeout(() => void calculate(config, financeAssumptions), AUTO_CALCULATE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // currentConfigKey captures every change of the setup and the assumptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConfigKey, isVisualizerReady, hasFreshResult, calculate]);

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(config);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('app.linkCopied'));
    } catch {
      toast.error(t('app.linkCopyFailed'), { description: url });
    }
  }, [config, t]);

  const handleConfigPatch = useCallback(
    (patch: Partial<FarmConfig>) => setConfig((prev) => normalizeFarmConfig({ ...prev, ...patch })),
    []
  );

  const middlePanel = (
    <ErrorBoundary
      fallback={(reset) => (
        <div className="panel-middle flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <p>{t('app.viewerError')}</p>
          <Button size="sm" variant="outline" onClick={reset}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    >
      <Suspense
        fallback={
          <div className="panel-middle flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="pulse-dot" />
              <div className="pulse-dot" style={{ animationDelay: '0.15s' }} />
              <div className="pulse-dot" style={{ animationDelay: '0.3s' }} />
            </div>
            <div>{t('app.viewerLoading')}</div>
          </div>
        }
      >
        <MiddlePanel
          config={modelConfig}
          isReady={isModelRenderable}
          missingItems={modelMissingItems}
          onConfigChange={handleConfigPatch}
          selectedPart={selectedPart}
          onSelectedPartChange={selectOnModel}
        />
      </Suspense>
    </ErrorBoundary>
  );

  const ai = useAiAssistant({ token, config, assumptions: financeAssumptions, locale: language });

  // Every figure comes from the server's calculation for this setup and these assumptions.
  const financials = displayedResult?.returns ?? null;

  const goToStep = useCallback((next: StepId) => {
    setStep(next);
    setVisited((previous) => (previous.has(next) ? previous : new Set([...previous, next])));
  }, []);

  const startRecommended = useCallback(() => {
    setConfig(normalizeFarmConfig({ ...DEFAULT_CONFIG, state: '', district: '' }));
    setRestoredConfigVersion((version) => version + 1);
    setStep('design');
    setMobileDesignView('setup');
    // Everything but the location is set, so that is what is left to do.
    setDesignTab('location');
  }, []);

  const designCompleteCard = isVisualizerReady ? (
    <div className="rounded-xl border border-primary/20 bg-accent/60 p-3" data-testid="design-complete">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        {t('ws.designDone')}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('ws.designDoneDesc')}</p>
      <Button size="sm" className="mt-2 w-full" onClick={() => goToStep('site')}>
        {t('ws.next', { step: t('ws.steps.site') })}
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    </div>
  ) : null;

  const statusPill = isVisualizerReady ? (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs" aria-live="polite">
      {displayedResult ? (
        <>
          <span className="hidden font-semibold text-foreground sm:inline">{formatINRCompact(displayedResult.cost.capitalCost)}</span>
          <span className="hidden text-muted-foreground sm:inline">·</span>
          <span className="hidden text-muted-foreground md:inline">{t('app.statusBirds', { birds: formatNumber(displayedResult.flock.birds) })}</span>
          <span className="hidden text-muted-foreground md:inline">·</span>
        </>
      ) : null}
      <span className={cn('inline-flex items-center gap-1', isLoading || isRefreshing ? 'text-amber-600' : 'text-emerald-600')}>
        <span className={cn('h-1.5 w-1.5 rounded-full', isLoading || isRefreshing ? 'bg-amber-500' : 'bg-emerald-500')} />
        {isLoading || isRefreshing ? t('app.statusUpdating') : t('right.statusUpToDate')}
      </span>
    </div>
  ) : null;

  const designSidebar = (
    <DesignSidebar
      config={config}
      onConfigChange={handleConfigPatch}
      onValidationChange={setIsConfigValid}
      onProgressChange={setSectionProgress}
      restoredConfigVersion={restoredConfigVersion}
      footer={designCompleteCard}
      touched={setupTouched}
      onTouchedChange={setSetupTouched}
      tab={designTab}
      onTabChange={openDesignTab}
    />
  );

  const designStep = isMobile ? (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-card p-2">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={t('ws.steps.design')}>
          {(['setup', 'model'] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="radio"
              aria-checked={mobileDesignView === view}
              onClick={() => setMobileDesignView(view)}
              className={cn(
                'inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors',
                mobileDesignView === view ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {view === 'setup' ? <SlidersHorizontal className="h-4 w-4" /> : <Box className="h-4 w-4" />}
              {view === 'setup' ? t('ws.setupView') : t('ws.modelView')}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">{mobileDesignView === 'setup' ? designSidebar : middlePanel}</div>
    </div>
  ) : (
    <div className="flex h-full overflow-hidden">
      <section className="relative min-w-0 flex-1" aria-label={t('app.tab3d')}>
        {middlePanel}
      </section>
      {/* Docked like Blender's properties editor: always there, never floating over the model. */}
      <div className="w-[320px] shrink-0 border-l border-border xl:w-[340px]">{designSidebar}</div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="z-30 shrink-0 border-b border-border bg-card">
        <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="shrink-0" aria-label={t('app.goHome')}>
              <Logo compact />
            </Link>
            {!isMobile ? (
              <Link
                to="/dashboard"
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LayoutDashboard className="h-4 w-4" />
                {t('nav.dashboard')}
              </Link>
            ) : null}
            <span className="hidden h-6 w-px bg-border md:block" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {config.district ? `${config.district}, ${config.state}` : t('app.untitledProject')}
              </p>
              <p className="hidden text-[11px] text-muted-foreground sm:block" aria-live="polite">
                {t('app.setup')} {setupProgress}% · {isVisualizerReady ? t('app.complete') : t('app.inProgress')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setGuideOpen(true)}
              aria-label={t('ws.howItWorks')}
              title={t('ws.howItWorks')}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            {!isMobile ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => void handleShare()}
                  disabled={!isModelRenderable}
                  title={t('app.shareHint')}
                  aria-label={t('app.share')}
                >
                  <Share2 className="h-4 w-4 lg:mr-1.5" />
                  <span className="hidden lg:inline">{t('app.share')}</span>
                </Button>
                {token ? (
                  <Button variant="ghost" size="sm" className="h-9" onClick={() => setIsSavedDialogOpen(true)} aria-label={t('app.savedButton')}>
                    <FolderOpen className="h-4 w-4 lg:mr-1.5" />
                    <span className="hidden lg:inline">{t('app.savedButton')}</span>
                  </Button>
                ) : null}
              </>
            ) : null}
            <TopRightMenu />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border/60 px-2 py-1.5 sm:px-4">
          <div className="min-w-0 flex-1">
            <StepBar current={step} onSelect={goToStep} designComplete={isVisualizerReady} visited={visited} />
          </div>
          {statusPill}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden bg-background" role="tabpanel" aria-labelledby={`step-tab-${step}`}>
        {step === 'design' ? (
          designStep
        ) : (
          <StepViews
            step={step}
            onNavigate={goToStep}
            config={config}
            result={displayedResult}
            isLoading={isLoading || isRefreshing}
            calculationError={activeCalculationError}
            onRetry={handleCalculate}
            ready={isVisualizerReady}
            missingItems={missingItems}
            assumptions={financeAssumptions}
            onAssumptionsChange={setFinanceAssumptions}
            financials={financials}
            sitingTicks={sitingTicks}
            onSitingTicksChange={setSitingTicks}
            loanTerms={loanTerms}
            onLoanTermsChange={setLoanTerms}
            ai={token ? ai : undefined}
            includeAiSummary={includeAiSummary}
            onIncludeAiSummaryChange={setIncludeAiSummary}
            onShare={() => void handleShare()}
            onOpenSaved={token ? () => setIsSavedDialogOpen(true) : undefined}
          />
        )}
      </main>

      <AdvisorWidget
        ai={token ? ai : undefined}
        ready={Boolean(activeResult && isVisualizerReady)}
        step={step}
        onOpenSummary={() => goToStep('summary')}
        // Clear of the design sidebar (320 px, 340 px on wide screens).
        rightInset={!isMobile && step === 'design' ? 340 : 0}
      />
      <WelcomeGuide open={guideOpen} onOpenChange={setGuideOpen} onStartRecommended={startRecommended} />

      <SavedSetupsDialog
        open={isSavedDialogOpen}
        onOpenChange={setIsSavedDialogOpen}
        token={token}
        currentConfig={config}
        onLoad={(loaded) => {
          setConfig(normalizeFarmConfig(loaded));
          setRestoredConfigVersion((version) => version + 1);
        }}
        financeAssumptions={financeAssumptions}
      />
    </div>
  );
};

export default Index;
