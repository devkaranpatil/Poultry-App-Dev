import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Bookmark, Check, MapPin, RotateCcw, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BIRD_OPTIONS,
  CAGE_TIER_OPTIONS,
  CATEGORY_OPTIONS,
  DEFAULT_CONFIG,
  DIMENSION_LIMITS,
  ENTRY_OPTIONS,
  FARMING_MODEL_OPTIONS,
  FEEDING_OPTIONS,
  FRAME_OPTIONS,
  HOUSING_FOR_BIRD,
  HOUSING_OPTIONS,
  INDIAN_DISTRICTS,
  INDIAN_STATES,
  OPEN_SHED_MAX_WIDTH,
  ROOF_OPTIONS,
  ROOF_SHEET_OPTIONS,
  SIDE_WALL_OPTIONS,
  STOCKING_DENSITY_LIMITS,
  feedingFor,
  isLayerBird,
  isWithinDimensionLimits,
  normalizeFarmConfig,
  optionKey,
  type DimensionKey,
  type FarmConfig,
  type SetupSectionProgress,
} from '@/types/farm';
import { flockSize, floorAreaFor, sqftPerBird, SQFT_PER_SQM } from '@/lib/flock';
import { useI18n } from '@/context/I18nContext';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { OptionGrid, ShedTabIcon, SizeRow, Stat, type ShedTab } from './ShedControls';
import { OPTION_GROUP, PART_VALUES, isOptionLocked, type OptionPart } from '@/lib/sceneEdit';

import { DESIGN_TABS, type DesignTab } from './designTabs';

export type { DesignTab } from './designTabs';

/** The setup field each option tab sets. */
const TAB_FIELD: Partial<Record<DesignTab, keyof FarmConfig>> = {
  housing: 'housingSystem',
  roof: 'roofType',
  frame: 'frameMaterial',
  roofSheet: 'roofSheet',
  sideWalls: 'sideWalls',
  entry: 'entry',
  birds: 'birdType',
  feeding: 'feedingSystem',
};

const ALL_TOUCHED: Record<string, boolean> = {
  length: true,
  width: true,
  eavesHeight: true,
  ridgeHeight: true,
  housingSystem: true,
  roofType: true,
  frameMaterial: true,
  roofSheet: true,
  sideWalls: true,
  entry: true,
  birdType: true,
  feedingSystem: true,
  state: true,
  district: true,
};

const SECTIONS: Array<keyof SetupSectionProgress> = ['size', 'shed', 'birds', 'location'];
const SIZE_STEP: Record<DimensionKey, number> = { length: 0.5, width: 0.5, eavesHeight: 0.1, ridgeHeight: 0.1 };
const SIZE_LABEL: Record<DimensionKey, string> = { length: 'left.length', width: 'left.width', eavesHeight: 'left.eaves', ridgeHeight: 'left.ridge' };

interface RecentSetup {
  id: string;
  label: string;
  savedAt: string;
  config: FarmConfig;
}

const RECENT_SETUPS_KEY = 'farm.recent-setups.v2';
const MAX_RECENT_SETUPS = 3;

function readRecentSetups(): RecentSetup[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SETUPS_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentSetup[]) : [];
    return Array.isArray(parsed)
      ? parsed.slice(0, MAX_RECENT_SETUPS).map((item) => ({ ...item, config: normalizeFarmConfig(item.config) }))
      : [];
  } catch {
    return [];
  }
}

interface DesignSidebarProps {
  config: FarmConfig;
  onConfigChange: (patch: Partial<FarmConfig>) => void;
  onValidationChange: (isValid: boolean) => void;
  onProgressChange?: (progress: SetupSectionProgress) => void;
  /**
   * Bumped by the parent whenever a complete setup is loaded from outside the sidebar (restored
   * draft, share link, saved setup) so its filled-in parts count as done.
   */
  restoredConfigVersion?: number;
  /** Which fields the farmer has set. Held by the page so leaving the Design step keeps them. */
  touched: Record<string, boolean>;
  onTouchedChange: Dispatch<SetStateAction<Record<string, boolean>>>;
  tab: DesignTab;
  onTabChange: (tab: DesignTab) => void;
  /** Shown at the foot, for example the way on once the design is complete. */
  footer?: ReactNode;
}

/**
 * The one panel for designing the shed, docked beside the model like Blender's properties editor. A row of tabs
 * lists the parts; the open tab holds that part's sizes or options. Picking a part on the model opens its tab, and
 * opening a tab selects that part on the model.
 */
export function DesignSidebar({
  config,
  onConfigChange,
  onValidationChange,
  onProgressChange,
  restoredConfigVersion = 0,
  touched,
  onTouchedChange: setTouched,
  tab,
  onTabChange,
  footer,
}: DesignSidebarProps) {
  const { t } = useI18n();
  const [recentSetups, setRecentSetups] = useState<RecentSetup[]>(readRecentSetups);

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_SETUPS_KEY, JSON.stringify(recentSetups));
    } catch {
      // Storage full or blocked: recent setups are a convenience only.
    }
  }, [recentSetups]);

  const errors = useMemo(() => {
    const found: Record<string, string> = {};
    for (const key of ['length', 'width', 'eavesHeight', 'ridgeHeight'] as DimensionKey[]) {
      if (!(config[key] > 0)) found[key] = t('setup.notSet');
      // Same bounds the backend enforces (shared/poultry-limits.json).
      else if (!isWithinDimensionLimits(key, config[key])) found[key] = t('validation.range', DIMENSION_LIMITS[key]);
    }
    if (!found.ridgeHeight && !found.eavesHeight && config.ridgeHeight <= config.eavesHeight) found.ridgeHeight = t('validation.ridgeAbove');
    if (config.stockingDensity !== null && (config.stockingDensity < STOCKING_DENSITY_LIMITS.min || config.stockingDensity > STOCKING_DENSITY_LIMITS.max)) {
      found.stockingDensity = t('validation.range', STOCKING_DENSITY_LIMITS);
    }
    if (!config.state.trim()) found.state = t('validation.stateReq');
    if (!config.district.trim()) found.district = t('validation.districtReq');
    return found;
  }, [config, t]);

  useEffect(() => {
    onValidationChange(Object.keys(errors).length === 0);
  }, [errors, onValidationChange]);

  const progress = useMemo<SetupSectionProgress>(
    () => ({
      size:
        Boolean(touched.length && touched.width && touched.eavesHeight && touched.ridgeHeight) &&
        !errors.length &&
        !errors.width &&
        !errors.eavesHeight &&
        !errors.ridgeHeight,
      shed: Boolean(touched.housingSystem && touched.roofType && touched.frameMaterial && touched.roofSheet && touched.sideWalls && touched.entry),
      birds: Boolean(touched.birdType && touched.feedingSystem),
      location: Boolean(touched.state && touched.district) && config.state.trim() !== '' && config.district.trim() !== '',
    }),
    [config, touched, errors]
  );

  useEffect(() => {
    onProgressChange?.(progress);
  }, [progress, onProgressChange]);

  // A setup loaded from outside the sidebar counts as done for every field that holds a value.
  useEffect(() => {
    if (restoredConfigVersion === 0) return;
    setTouched({
      ...ALL_TOUCHED,
      length: config.length > 0,
      width: config.width > 0,
      eavesHeight: config.eavesHeight > 0,
      ridgeHeight: config.ridgeHeight > 0,
      state: config.state.trim() !== '',
      district: config.district.trim() !== '',
    });
    // Only react to a new load, not to every later edit of config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredConfigVersion]);

  /** Applies a change and counts every field it sets as chosen by the farmer. */
  const apply = useCallback(
    (patch: Partial<FarmConfig>, also: string[] = []) => {
      setTouched((previous) => {
        const next = { ...previous };
        for (const key of [...Object.keys(patch), ...also]) next[key] = true;
        return next;
      });
      onConfigChange(patch);
    },
    [onConfigChange, setTouched]
  );

  const applyRecommended = () => {
    onConfigChange({ ...normalizeFarmConfig(DEFAULT_CONFIG), state: '', district: '' });
    setTouched({ ...ALL_TOUCHED, state: false, district: false });
    // Everything but the location is now set, so that is what is left to do.
    onTabChange('location');
  };

  const clearAll = () => {
    onConfigChange({ ...normalizeFarmConfig(DEFAULT_CONFIG), length: 0, width: 0, eavesHeight: 0, ridgeHeight: 0, state: '', district: '' });
    setTouched({});
    onTabChange('size');
  };

  const birds = flockSize({ ...config, housing: config.housingSystem }) ?? 0;

  const saveCurrentSetup = () => {
    const item: RecentSetup = {
      id: `${Date.now()}`,
      label: `${t(optionKey('bird', config.birdType))} · ${formatNumber(birds)} · ${config.length}x${config.width} m`,
      savedAt: new Date().toISOString(),
      config: normalizeFarmConfig(config),
    };
    setRecentSetups((previous) => [item, ...previous.filter((setup) => setup.label !== item.label)].slice(0, MAX_RECENT_SETUPS));
  };

  const loadRecentSetup = (setup: RecentSetup) => {
    onConfigChange(normalizeFarmConfig(setup.config));
    setTouched(ALL_TOUCHED);
  };

  const tabDone = (item: DesignTab): boolean => {
    if (item === 'size') return progress.size;
    if (item === 'location') return progress.location;
    const field = TAB_FIELD[item];
    return field ? Boolean(touched[field]) : false;
  };
  const tabLabel = (item: DesignTab) => t(`design.tab.${item}`);
  const completed = SECTIONS.filter((section) => progress[section]).length;
  const areaSqm = config.length * config.width;

  const fieldError = (key: string) =>
    touched[key] && errors[key] ? (
      <p className="mt-1 text-xs text-destructive" role="alert">
        {errors[key]}
      </p>
    ) : null;

  const sizeRow = (key: DimensionKey) => (
    <div key={key}>
      <SizeRow
        id={key}
        label={t(SIZE_LABEL[key])}
        value={config[key]}
        min={DIMENSION_LIMITS[key].min}
        max={DIMENSION_LIMITS[key].max}
        step={SIZE_STEP[key]}
        unit="m"
        onCommit={(value) => apply({ [key]: value })}
      />
      {fieldError(key)}
    </div>
  );

  let body: ReactNode;
  if (tab === 'size') {
    const norm = sqftPerBird(config.birdType, config.housingSystem);
    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t('viewport.area')} value={`${formatNumber(areaSqm)} m²`} />
          <Stat label={t('viewport.areaSqft')} value={`${formatNumber(Math.round(areaSqm * SQFT_PER_SQM))} ft²`} />
          <Stat label={t('design.birds')} value={formatNumber(birds)} />
        </div>
        <div className="space-y-1.5">{(['length', 'width', 'eavesHeight', 'ridgeHeight'] as DimensionKey[]).map(sizeRow)}</div>
        <div className="space-y-1.5 rounded-lg border border-border p-2.5">
          <SizeRow
            id="flock"
            label={t('design.flockSize')}
            value={birds}
            min={0}
            max={1_000_000}
            step={50}
            unit={t('design.birdsUnit')}
            onCommit={(wanted) => {
              // "I want 5,000 birds": keep the width and lengthen the shed to hold them.
              const area = floorAreaFor({ birds: wanted, birdType: config.birdType, housing: config.housingSystem, stockingDensity: config.stockingDensity });
              if (area && config.width > 0) {
                const length = Math.min(DIMENSION_LIMITS.length.max, Math.max(DIMENSION_LIMITS.length.min, Math.ceil((area / config.width) * 2) / 2));
                apply({ length });
              }
            }}
          />
          <SizeRow
            id="density"
            label={t('design.stockingDensity')}
            value={config.stockingDensity ?? norm ?? 1}
            min={STOCKING_DENSITY_LIMITS.min}
            max={STOCKING_DENSITY_LIMITS.max}
            step={0.05}
            unit="ft²"
            onCommit={(value) => apply({ stockingDensity: value === norm ? null : value })}
          />
          {fieldError('stockingDensity')}
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{norm !== null ? t('design.densityNorm', { value: norm }) : null}</span>
            {config.stockingDensity !== null ? (
              <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => apply({ stockingDensity: null })}>
                <RotateCcw className="h-3 w-3" />
                {t('design.densityReset')}
              </button>
            ) : null}
          </div>
        </div>
        {config.housingSystem !== 'environment-controlled' && config.width > OPEN_SHED_MAX_WIDTH ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-foreground" role="note">
            {t('design.tooWide', { max: OPEN_SHED_MAX_WIDTH })}
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">{t('viewport.dragHint')}</p>
      </div>
    );
  } else if (tab === 'location') {
    const districts = config.state ? INDIAN_DISTRICTS[config.state] || [] : [];
    body = (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t('left.state')}</Label>
          <Select
            value={config.state || ''}
            onValueChange={(value) => {
              apply({ state: value, district: '' });
              setTouched((previous) => ({ ...previous, district: false }));
            }}
          >
            <SelectTrigger aria-label={t('left.state')} className={cn(touched.state && errors.state && 'border-destructive')}>
              <SelectValue placeholder={t('left.selectState')} />
            </SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError('state')}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t('left.district')}</Label>
          <Select value={config.district || ''} onValueChange={(value) => apply({ district: value })} disabled={!config.state}>
            <SelectTrigger aria-label={t('left.district')} className={cn(touched.district && errors.district && 'border-destructive')}>
              <SelectValue placeholder={t('left.selectDistrict')} />
            </SelectTrigger>
            <SelectContent>
              {districts.map((district) => (
                <SelectItem key={district} value={district}>
                  {district}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError('district')}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t('design.category')}</Label>
          <OptionGrid
            group="category"
            label={t('design.category')}
            options={CATEGORY_OPTIONS.map((option) => option.value)}
            value={config.beneficiaryCategory}
            onChange={(value) => apply({ beneficiaryCategory: value })}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('design.categoryHint')}</p>
        </div>
      </div>
    );
  } else if (tab === 'birds') {
    const layer = isLayerBird(config.birdType);
    body = (
      <div className="space-y-4">
        <OptionGrid
          group="bird"
          label={tabLabel('birds')}
          options={BIRD_OPTIONS.map((option) => option.value)}
          value={config.birdType}
          onChange={(value) => apply({ birdType: value })}
        />
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t('design.farmingModel')}</Label>
          <OptionGrid
            group="farming"
            label={t('design.farmingModel')}
            options={FARMING_MODEL_OPTIONS.map((option) => option.value)}
            value={config.farmingModel}
            isDisabled={(value) => value === 'contract' && layer}
            onChange={(value) => apply({ farmingModel: value })}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t(layer ? 'design.contractLayers' : `design.farmingHint.${config.farmingModel}`)}</p>
        </div>
        {config.birdType === 'layer-cage' ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t('design.cageTiers')}</Label>
            <OptionGrid group="cageTiers" label={t('design.cageTiers')} options={CAGE_TIER_OPTIONS} value={config.cageTiers} onChange={(value) => apply({ cageTiers: value })} />
          </div>
        ) : null}
      </div>
    );
  } else {
    // An option tab. Choices that do not fit the bird or the shed type are shown, but cannot be picked.
    // The same rules the model's own option keys follow (src/lib/sceneEdit.ts).
    const part = tab as OptionPart;
    const spec = { group: OPTION_GROUP[part], values: PART_VALUES[part], disabled: (value: string) => isOptionLocked(part, value, config) };
    const field = TAB_FIELD[tab] as keyof FarmConfig;
    body = (
      <div className="space-y-3">
        <OptionGrid
          group={spec.group}
          label={tabLabel(tab)}
          options={spec.values}
          value={String(config[field])}
          isDisabled={spec.disabled}
          onChange={(value) => apply({ [field]: value } as Partial<FarmConfig>)}
        />
        {tab === 'roof' ? <div className="space-y-1.5 pt-1">{(['eavesHeight', 'ridgeHeight'] as DimensionKey[]).map(sizeRow)}</div> : null}
        <p className="text-xs leading-relaxed text-muted-foreground">{t(optionKey(`${spec.group}Hint`, String(config[field])))}</p>
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card text-sm" aria-label={t('viewport.properties')} data-testid="properties-panel">
      <header className="space-y-3 border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-foreground">{t('setup.title')}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground" data-testid="setup-progress">
            {t('setup.stepsDone', { done: completed, total: SECTIONS.length })}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={saveCurrentSetup}
            className="h-7 w-7 shrink-0 text-muted-foreground"
            aria-label={t('setup.keepRecent')}
            title={t('setup.keepRecent')}
          >
            <Bookmark className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(completed / SECTIONS.length) * 100}%` }} />
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={applyRecommended} className="h-8 flex-1">
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            {t('setup.recommended')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={clearAll} className="h-8">
            {t('setup.blank')}
          </Button>
        </div>
        {recentSetups.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">{t('left.recent')}:</span>
            {recentSetups.map((item) => (
              <span key={item.id} className="group inline-flex max-w-full items-center rounded-full border border-border text-[11px]">
                <button type="button" onClick={() => loadRecentSetup(item)} className="truncate rounded-l-full py-0.5 pl-2 pr-1 text-foreground hover:bg-muted">
                  {item.label}
                </button>
                <button
                  type="button"
                  onClick={() => setRecentSetups((previous) => previous.filter((setup) => setup.id !== item.id))}
                  className="rounded-r-full py-0.5 pl-0.5 pr-1.5 text-muted-foreground hover:text-destructive"
                  aria-label={`${t('common.remove')} ${item.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <nav aria-label={t('edit.partsLabel')} className="grid grid-cols-5 gap-1 border-b border-border p-2">
        {DESIGN_TABS.map((item) => {
          const active = tab === item;
          const done = tabDone(item);
          return (
            <button
              key={item}
              type="button"
              aria-pressed={active}
              onClick={() => onTabChange(item)}
              title={done ? `${tabLabel(item)} · ${t('setup.done')}` : tabLabel(item)}
              className={cn(
                'relative flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 pb-1.5 pt-2 text-[10.5px] leading-tight transition-colors duration-150',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {item === 'location' ? <MapPin className="h-4 w-4 shrink-0" /> : <ShedTabIcon tab={item} className="h-4 w-4 shrink-0" />}
              <span className="max-w-full truncate">{tabLabel(item)}</span>
              {done ? (
                <span
                  className={cn(
                    'absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full',
                    active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
                  )}
                  aria-hidden
                >
                  <Check className="h-2 w-2" strokeWidth={4} />
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <section key={tab} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 animate-in fade-in-0 duration-150" data-testid="part-editor" data-part={tab}>
        <h3 className="text-sm font-semibold text-foreground">{tabLabel(tab)}</h3>
        <p className="mb-3 mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(`design.help.${tab}`)}</p>
        {body}
      </section>

      {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
    </aside>
  );
}
