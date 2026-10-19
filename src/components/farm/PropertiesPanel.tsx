import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Minus, PanelRightClose, Plus, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import { DIMENSION_LIMITS, type FarmConfig } from '@/types/farm';
import {
  CONFIG_FIELD,
  PART_ORDER,
  PART_VALUES,
  SNAP_STEP,
  coverSurface,
  isOptionLocked,
  optionLabelKey,
  optionPatch,
  resizePatch,
  type EditablePart,
  type OptionPart,
  type ResizeKey,
} from '@/lib/sceneEdit';
import { cn } from '@/lib/utils';
import { OptionThumb, PartIcon } from './OptionThumb';

interface PropertiesPanelProps {
  config: FarmConfig;
  selected: EditablePart | null;
  onSelect: (part: EditablePart | null) => void;
  onChange: (patch: Partial<FarmConfig>) => void;
  compact: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SIZE_ROWS: Array<{ key: ResizeKey; labelKey: string }> = [
  { key: 'length', labelKey: 'left.length' },
  { key: 'width', labelKey: 'left.width' },
  { key: 'gutterHeight', labelKey: 'left.gutter' },
  { key: 'ridgeHeight', labelKey: 'left.ridge' },
];

/** A dimension with nudge buttons and a typed value; both go through the same snapping as dragging. */
export function SizeRow({ config, rowKey, label, onChange }: { config: FarmConfig; rowKey: ResizeKey; label: string; onChange: (patch: Partial<FarmConfig>) => void }) {
  const [draft, setDraft] = useState(String(config[rowKey]));
  const disabled = rowKey === 'ridgeHeight' && config.roofType === 'flat';
  const { min, max } = DIMENSION_LIMITS[rowKey];

  // Follow changes that come from dragging a grip or from the setup form.
  useEffect(() => setDraft(String(config[rowKey])), [config, rowKey]);

  const commit = (raw: number) => {
    const patch = resizePatch(config, rowKey, raw);
    if (Object.keys(patch).length > 0) onChange(patch);
    else setDraft(String(config[rowKey]));
  };
  const nudge = (direction: 1 | -1) => commit(config[rowKey] + direction * SNAP_STEP[rowKey]);

  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={`edit-size-${rowKey}`} className="min-w-0 truncate text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || config[rowKey] <= min} onClick={() => nudge(-1)} aria-label={`${label} -`}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <input
          id={`edit-size-${rowKey}`}
          type="number"
          inputMode="decimal"
          className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-center font-mono text-xs tabular-nums disabled:opacity-50"
          value={draft}
          min={min}
          max={max}
          step={SNAP_STEP[rowKey]}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const value = Number(draft);
            if (draft.trim() !== '' && Number.isFinite(value)) commit(value);
            else setDraft(String(config[rowKey]));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || config[rowKey] >= max} onClick={() => nudge(1)} aria-label={`${label} +`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-3 text-[11px] text-muted-foreground">m</span>
      </div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/60 px-2 py-1.5">
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xs font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export function OptionGrid({ part, config, onChange, compact }: { part: OptionPart; config: FarmConfig; onChange: (patch: Partial<FarmConfig>) => void; compact: boolean }) {
  const { t } = useI18n();
  const field = CONFIG_FIELD[part];
  return (
    <div role="radiogroup" aria-label={t(`edit.part.${part}`)} className={cn('grid gap-1.5', compact ? 'grid-cols-4' : 'grid-cols-2')}>
      {(PART_VALUES[part] as readonly string[]).map((value) => {
        const selected = config[field] === value;
        const locked = isOptionLocked(part, value, config);
        const label = t(optionLabelKey(part, value));
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            disabled={locked}
            onClick={() => onChange(optionPatch(part, value, config))}
            className={cn(
              'group flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center text-[11px] font-medium leading-tight transition-all duration-150',
              'disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary))]'
                : 'border-border bg-card text-muted-foreground hover:-translate-y-px hover:border-foreground/30 hover:text-foreground'
            )}
          >
            <span className={cn('transition-transform duration-150', selected ? 'scale-110 text-primary' : 'group-hover:scale-105')}>
              <OptionThumb part={part} value={value} />
            </span>
            <span className="line-clamp-2 w-full">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PartBody({ part, config, onChange, compact }: { part: EditablePart; config: FarmConfig; onChange: PropertiesPanelProps['onChange']; compact: boolean }) {
  const { t } = useI18n();
  const area = config.length * config.width;
  const volume = area * ((config.gutterHeight + config.ridgeHeight) / 2);
  const rise = Math.max(config.ridgeHeight - config.gutterHeight, 0);
  const shadeLocked = config.greenhouseType === 'shade-net' && (part === 'cover' || part === 'vents' || part === 'door');

  if (part === 'size') {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label={t('viewport.area')} value={`${area.toFixed(0)} m²`} />
          <Stat label={t('viewport.volume')} value={`${volume.toFixed(0)} m³`} />
        </div>
        <div className="space-y-1">
          {SIZE_ROWS.map((row) => (
            <SizeRow key={row.key} config={config} rowKey={row.key} label={t(row.labelKey)} onChange={onChange} />
          ))}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{t('viewport.dragHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {part === 'roof' ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label={t('viewport.rise')} value={`${rise.toFixed(1)} m`} />
          <Stat label={t('left.ridge')} value={`${config.ridgeHeight} m`} />
        </div>
      ) : null}
      {part === 'cover' ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label={t('viewport.coverSurface')} value={`≈ ${coverSurface(config).toFixed(0)} m²`} />
          <Stat label={t('viewport.area')} value={`${area.toFixed(0)} m²`} />
        </div>
      ) : null}
      <OptionGrid part={part} config={config} onChange={onChange} compact={compact} />
      {part === 'roof' ? (
        <div className="space-y-1 pt-1">
          <SizeRow config={config} rowKey="gutterHeight" label={t('left.gutter')} onChange={onChange} />
          <SizeRow config={config} rowKey="ridgeHeight" label={t('left.ridge')} onChange={onChange} />
        </div>
      ) : null}
      {shadeLocked ? <p className="text-[11px] leading-snug text-muted-foreground">{t('edit.shadeLocked')}</p> : null}
      {!compact ? <p className="text-[11px] leading-snug text-muted-foreground">{t('viewport.chooseHint')}</p> : null}
    </div>
  );
}

/** Which ends of a sideways-scrolling row have more to show, for a fade at that edge. */
function useScrollEdges() {
  const ref = useRef<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const start = element.scrollLeft > 2;
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
    setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, []);
  const attach = useCallback(
    (element: HTMLElement | null) => {
      ref.current = element;
      measure();
    },
    [measure]
  );
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  const fade =
    edges.start && edges.end
      ? 'linear-gradient(to right, transparent, black 1.5rem, black calc(100% - 2.5rem), transparent)'
      : edges.end
        ? 'linear-gradient(to right, black calc(100% - 2.5rem), transparent)'
        : edges.start
          ? 'linear-gradient(to right, transparent, black 1.5rem)'
          : undefined;
  return { attach, measure, style: fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined };
}

/**
 * Blender's N-panel for the model: an outliner listing the parts and, below it, the properties of
 * the selected one. Sizes are changed by dragging the model itself; here they can also be typed.
 *
 * On a phone (compact) it is a bottom sheet that keeps clear of the grips: a part picked on the
 * model shows as one slim bar with its name, and its options open on request. A part picked from
 * the list opens with its options, since choosing them is what the list is for.
 */
export function PropertiesPanel({ config, selected, onSelect, onChange, compact, open, onOpenChange }: PropertiesPanelProps) {
  const { t } = useI18n();
  const [outlinerOpen, setOutlinerOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const pickedFromList = useRef(false);
  const partsRow = useScrollEdges();

  useEffect(() => {
    setExpanded(pickedFromList.current && selected !== null);
    pickedFromList.current = false;
  }, [selected]);

  const pick = (part: EditablePart | null) => {
    pickedFromList.current = true;
    onSelect(part);
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="pointer-events-auto h-8 gap-1.5 self-end px-2.5 text-xs shadow-soft"
        onClick={() => onOpenChange(true)}
        data-testid="properties-toggle"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {selected ? t(`edit.part.${selected}`) : t('viewport.properties')}
      </Button>
    );
  }

  const heading = (part: EditablePart) => (
    <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400">
        <PartIcon part={part} className="h-3.5 w-3.5" />
      </span>
      <span className="truncate">{t(`edit.part.${part}`)}</span>
    </h3>
  );

  // Phone, part picked on the model: one slim bar, so the grips above it stay free to drag.
  if (compact && selected && !expanded) {
    return (
      <aside
        className="glass-elevated pointer-events-auto flex w-full items-center gap-1 rounded-xl py-1 pl-2.5 pr-1 text-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
        aria-label={t('viewport.properties')}
        data-testid="properties-panel"
      >
        <div className="min-w-0 flex-1" data-testid="part-editor" data-part={selected} data-collapsed="true">
          {heading(selected)}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1 px-2 text-xs"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          data-testid="properties-expand"
        >
          <ChevronUp className="h-4 w-4" />
          {t('viewport.showOptions')}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onSelect(null)} aria-label={t('edit.close')}>
          <X className="h-4 w-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        'glass-elevated pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl text-sm animate-in fade-in-0 duration-200',
        compact ? 'w-full slide-in-from-bottom-2' : 'w-[15rem] slide-in-from-right-4'
      )}
      aria-label={t('viewport.properties')}
      data-testid="properties-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          aria-expanded={outlinerOpen}
          onClick={() => setOutlinerOpen((value) => !value)}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', outlinerOpen ? '' : '-rotate-90')} />
          {t('viewport.outliner')}
        </button>
        {compact && selected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            aria-expanded
            onClick={() => setExpanded(false)}
            data-testid="properties-expand"
          >
            <ChevronDown className="h-4 w-4" />
            {t('viewport.hideOptions')}
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenChange(false)} aria-label={t('viewport.collapse')}>
            <PanelRightClose className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {outlinerOpen ? (
        <nav
          ref={compact ? partsRow.attach : undefined}
          onScroll={compact ? partsRow.measure : undefined}
          style={compact ? partsRow.style : undefined}
          aria-label={t('edit.partsLabel')}
          className={cn(
            'border-b border-border p-1',
            compact
              ? 'flex snap-x gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              : 'grid grid-cols-3 gap-0.5'
          )}
          data-testid="parts-row"
        >
          {PART_ORDER.map((part) => {
            const active = selected === part;
            return (
              <button
                key={part}
                type="button"
                aria-pressed={active}
                onClick={() => pick(active ? null : part)}
                className={cn(
                  'flex shrink-0 snap-start rounded-md transition-colors duration-150',
                  // A phone row reads left to right; the narrow desktop panel stacks icon over name so names fit.
                  compact ? 'items-center gap-1.5 px-2 py-1.5 text-left text-xs' : 'min-w-0 flex-col items-center gap-0.5 px-1 py-1 text-[10.5px] leading-tight',
                  active ? 'bg-orange-500 text-white' : 'text-foreground hover:bg-muted'
                )}
                title={compact ? undefined : t(`edit.part.${part}`)}
              >
                <PartIcon part={part} className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-full truncate">{t(`edit.part.${part}`)}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {selected ? (
        <section
          key={selected}
          className="min-h-0 flex-1 overflow-y-auto p-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200"
          aria-label={t(`edit.part.${selected}`)}
          data-testid="part-editor"
          data-part={selected}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            {heading(selected)}
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSelect(null)} aria-label={t('edit.close')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <PartBody part={selected} config={config} onChange={onChange} compact={compact} />
        </section>
      ) : (
        <p className={cn('px-2.5 text-[11px] leading-snug text-muted-foreground', compact ? 'py-1.5' : 'py-2.5')}>{t('viewport.nothingSelected')}</p>
      )}
    </aside>
  );
}
