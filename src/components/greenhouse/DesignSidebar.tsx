import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Bookmark, Check, MapPin, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DEFAULT_CONFIG,
  DIMENSION_LIMITS,
  INDIAN_DISTRICTS,
  INDIAN_STATES,
  isWithinDimensionLimits,
  normalizeGreenhouseConfig,
  type DimensionKey,
  type GreenhouseConfig,
  type SetupSectionProgress,
} from '@/types/greenhouse';
import { CONFIG_FIELD, coverSurface, type EditablePart, type OptionPart } from '@/lib/sceneEdit';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils';
import { OptionGrid, SizeRow, Stat } from './PropertiesPanel';
import { PartIcon } from './OptionThumb';

/** A tab of the sidebar: one part of the model, or where it will be built. */
export type DesignTab = EditablePart | 'location';

/** Tab order follows how a polyhouse is planned: its size and kind, then what it is made of, then what grows in it. */
const DESIGN_TABS: DesignTab[] = ['size', 'type', 'roof', 'frame', 'cover', 'vents', 'door', 'crop', 'irrigation', 'location'];

const ALL_TOUCHED: Record<string, boolean> = {
  length: true,
  width: true,
  gutterHeight: true,
  ridgeHeight: true,
  greenhouseType: true,
  roofType: true,
  structureMaterial: true,
  coverMaterial: true,
  sideVentilation: true,
  doorEntry: true,
  selectedCrop: true,
  irrigationSystem: true,
  state: true,
  district: true,
};

const SECTIONS: Array<keyof SetupSectionProgress> = ['baseDimensions', 'heights', 'typeAndRoof', 'materials', 'access', 'cultivation', 'location'];

interface RecentSetup {
  id: string;
  label: string;
  savedAt: string;
  config: GreenhouseConfig;
}

const RECENT_SETUPS_KEY = 'greenhouse.recent-setups.v1';
const MAX_RECENT_SETUPS = 3;
const EPSILON = 0.001;

function readRecentSetups(): RecentSetup[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SETUPS_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentSetup[]) : [];
    return Array.isArray(parsed)
      ? parsed.slice(0, MAX_RECENT_SETUPS).map((item) => ({ ...item, config: normalizeGreenhouseConfig(item.config) }))
      : [];
  } catch {
    return [];
  }
}

interface DesignSidebarProps {
  config: GreenhouseConfig;
  onConfigChange: (patch: Partial<GreenhouseConfig>) => void;
  onValidationChange: (isValid: boolean) => void;
  onProgressChange?: (progress: SetupSectionProgress) => void;
  /**
   * Bumped by the parent whenever a complete setup is loaded from outside the sidebar (restored
   * draft, share link, saved setup) so its filled-in parts count as done.
   */
  restoredConfigVersion?: number;
  /** Which fields the grower has set. Held by the page so leaving the Design step keeps them. */
  touched: Record<string, boolean>;
  onTouchedChange: Dispatch<SetStateAction<Record<string, boolean>>>;
  tab: DesignTab;
  onTabChange: (tab: DesignTab) => void;
  /** Shown at the foot, for example the way on once the design is complete. */
  footer?: ReactNode;
}

/**
 * The one panel for designing the greenhouse, docked beside the model like Blender's properties
 * editor. A row of tabs lists the parts; the open tab holds that part's sizes or options. Picking a
 * part on the model opens its tab, and opening a tab selects that part on the model.
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
    for (const key of ['length', 'width', 'gutterHeight', 'ridgeHeight'] as DimensionKey[]) {
      if (!(config[key] > 0)) found[key] = t('setup.notSet');
    }
    if (config.roofType === 'flat') {
      if (Math.abs(config.ridgeHeight - config.gutterHeight) > EPSILON) found.ridgeHeight = t('validation.flatRidge');
    } else if (!found.ridgeHeight && config.ridgeHeight <= config.gutterHeight) {
      found.ridgeHeight = t('validation.ridgeAbove');
    }
    // Same bounds the backend enforces (shared/greenhouse-limits.json); a flat roof's ridge follows the gutter.
    const ranged: DimensionKey[] = config.roofType === 'flat' ? ['length', 'width', 'gutterHeight'] : ['length', 'width', 'gutterHeight', 'ridgeHeight'];
    for (const key of ranged) {
      if (!found[key] && !isWithinDimensionLimits(key, config[key])) found[key] = t('validation.range', DIMENSION_LIMITS[key]);
    }
    if (!config.state.trim()) found.state = t('validation.stateReq');
    if (!config.district.trim()) found.district = t('validation.districtReq');
    return found;
  }, [config, t]);

  useEffect(() => {
    onValidationChange(Object.keys(errors).length === 0);
  }, [errors, onValidationChange]);

  const progress = useMemo<SetupSectionProgress>(() => {
    const heightsFit = config.roofType === 'flat' ? Math.abs(config.ridgeHeight - config.gutterHeight) < EPSILON : config.ridgeHeight > config.gutterHeight;
    return {
      baseDimensions: Boolean(touched.length && touched.width) && config.length > 0 && config.width > 0,
      heights:
        Boolean(touched.gutterHeight) &&
        (config.roofType === 'flat' || Boolean(touched.ridgeHeight)) &&
        config.gutterHeight > 0 &&
        config.ridgeHeight > 0 &&
        heightsFit,
      typeAndRoof: Boolean(touched.greenhouseType && touched.roofType),
      materials: Boolean(touched.structureMaterial && touched.coverMaterial),
      access: Boolean(touched.sideVentilation && touched.doorEntry),
      cultivation: Boolean(config.selectedCrop && config.irrigationSystem),
      location: Boolean(touched.state && touched.district) && config.state.trim() !== '' && config.district.trim() !== '',
    };
  }, [config, touched]);

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
      gutterHeight: config.gutterHeight > 0,
      ridgeHeight: config.ridgeHeight > 0,
      state: config.state.trim() !== '',
      district: config.district.trim() !== '',
    });
    // Only react to a new load, not to every later edit of config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredConfigVersion]);

  /** Applies a change and counts every field it sets as chosen by the grower. */
  const apply = useCallback(
    (patch: Partial<GreenhouseConfig>, also: string[] = []) => {
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
    onConfigChange({ ...normalizeGreenhouseConfig(DEFAULT_CONFIG), state: '', district: '' });
    setTouched({ ...ALL_TOUCHED, state: false, district: false });
    // Everything but the location is now set, so that is what is left to do.
    onTabChange('location');
  };

  const clearAll = () => {
    onConfigChange({ ...normalizeGreenhouseConfig(DEFAULT_CONFIG), length: 0, width: 0, gutterHeight: 0, ridgeHeight: 0, state: '', district: '' });
    setTouched({});
    onTabChange('size');
  };

  const saveCurrentSetup = () => {
    const item: RecentSetup = {
      id: `${Date.now()}`,
      label: `${config.greenhouseType.replace(/-/g, ' ')} - ${config.length}x${config.width}m`,
      savedAt: new Date().toISOString(),
      config: normalizeGreenhouseConfig(config),
    };
    setRecentSetups((previous) => [item, ...previous.filter((setup) => setup.label !== item.label)].slice(0, MAX_RECENT_SETUPS));
  };

  const loadRecentSetup = (setup: RecentSetup) => {
    onConfigChange(normalizeGreenhouseConfig(setup.config));
    setTouched(ALL_TOUCHED);
  };

  const tabDone = (item: DesignTab): boolean => {
    if (item === 'size') return progress.baseDimensions && progress.heights;
    if (item === 'location') return progress.location;
    return Boolean(touched[CONFIG_FIELD[item as OptionPart]]);
  };
  const tabLabel = (item: DesignTab) => (item === 'location' ? t('setup.stepLocation') : t(`edit.part.${item}`));
  const completed = SECTIONS.filter((section) => progress[section]).length;
  const area = config.length * config.width;

  const fieldError = (key: string) =>
    touched[key] && errors[key] ? (
      <p className="mt-1 text-xs text-destructive" role="alert">
        {errors[key]}
      </p>
    ) : null;

  let body: ReactNode;
  if (tab === 'size') {
    const volume = area * ((config.gutterHeight + config.ridgeHeight) / 2);
    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t('viewport.area')} value={`${area.toFixed(0)} m²`} />
          <Stat label={t('viewport.volume')} value={`${volume.toFixed(0)} m³`} />
        </div>
        <div className="space-y-1.5">
          <SizeRow config={config} rowKey="length" label={t('left.length')} onChange={apply} />
          <SizeRow config={config} rowKey="width" label={t('left.width')} onChange={apply} />
          <SizeRow config={config} rowKey="gutterHeight" label={t('left.gutter')} onChange={apply} />
          <SizeRow config={config} rowKey="ridgeHeight" label={t('left.ridge')} onChange={(patch) => apply(patch, ['ridgeHeight'])} />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{config.roofType === 'flat' ? t('left.flatRoofHint') : t('viewport.dragHint')}</p>
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
      </div>
    );
  } else {
    const part = tab as OptionPart;
    const shadeLocked = config.greenhouseType === 'shade-net' && (part === 'cover' || part === 'vents' || part === 'door');
    body = (
      <div className="space-y-3">
        {part === 'cover' ? (
          <div className="grid grid-cols-2 gap-2">
            <Stat label={t('viewport.coverSurface')} value={`≈ ${coverSurface(config).toFixed(0)} m²`} />
            <Stat label={t('viewport.area')} value={`${area.toFixed(0)} m²`} />
          </div>
        ) : null}
        <OptionGrid part={part} config={config} onChange={(patch) => apply(patch, [CONFIG_FIELD[part]])} compact={false} />
        {part === 'roof' ? (
          <div className="space-y-1.5 pt-1">
            <SizeRow config={config} rowKey="gutterHeight" label={t('left.gutter')} onChange={apply} />
            <SizeRow config={config} rowKey="ridgeHeight" label={t('left.ridge')} onChange={apply} />
          </div>
        ) : null}
        {shadeLocked ? <p className="text-xs leading-relaxed text-muted-foreground">{t('edit.shadeLocked')}</p> : null}
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
              {item === 'location' ? <MapPin className="h-4 w-4 shrink-0" /> : <PartIcon part={item} className="h-4 w-4 shrink-0" />}
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
