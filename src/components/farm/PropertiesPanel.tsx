import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, PanelRightClose, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import { DIMENSION_LIMITS, type FarmConfig } from '@/types/farm';
import {
  CONFIG_FIELD,
  OPTION_GROUP,
  PART_ORDER,
  PART_VALUES,
  SNAP_STEP,
  isOptionLocked,
  optionPatch,
  partLabelKey,
  resizePatch,
  roofSurface,
  type EditablePart,
  type ResizeKey,
} from '@/lib/sceneEdit';
import { flockSize } from '@/lib/flock';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { OptionGrid, ShedTabIcon, SizeRow, Stat } from './ShedControls';

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
  { key: 'eavesHeight', labelKey: 'left.eaves' },
  { key: 'ridgeHeight', labelKey: 'left.ridge' },
];

/** A size of the shed, through the same snapping and limits as dragging its grip. */
function DimensionRow({ config, rowKey, label, onChange }: { config: FarmConfig; rowKey: ResizeKey; label: string; onChange: (patch: Partial<FarmConfig>) => void }) {
  const { min, max } = DIMENSION_LIMITS[rowKey];
  return (
    <SizeRow
      id={rowKey}
      label={label}
      value={config[rowKey]}
      min={min}
      max={max}
      step={SNAP_STEP[rowKey]}
      unit="m"
      onCommit={(value) => {
        const patch = resizePatch(config, rowKey, value);
        if (Object.keys(patch).length > 0) onChange(patch);
      }}
    />
  );
}

function PartBody({ part, config, onChange }: { part: EditablePart; config: FarmConfig; onChange: PropertiesPanelProps['onChange'] }) {
  const { t } = useI18n();
  const area = config.length * config.width;
  const rise = Math.max(config.ridgeHeight - config.eavesHeight, 0);

  if (part === 'size') {
    const birds = flockSize({ ...config, housing: config.housingSystem }) ?? 0;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label={t('viewport.area')} value={`${area.toFixed(0)} m²`} />
          <Stat label={t('design.birds')} value={formatNumber(birds)} />
        </div>
        <div className="space-y-1">
          {SIZE_ROWS.map((row) => (
            <DimensionRow key={row.key} config={config} rowKey={row.key} label={t(row.labelKey)} onChange={onChange} />
          ))}
        </div>
        <p className="text-[12px] leading-snug text-muted-foreground">{t('viewport.dragHint')}</p>
      </div>
    );
  }

  const field = CONFIG_FIELD[part];
  return (
    <div className="space-y-2">
      {part === 'roof' || part === 'roofSheet' ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label={t('viewport.rise')} value={`${rise.toFixed(1)} m`} />
          <Stat label={t('viewport.roofSurface')} value={`≈ ${roofSurface(config).toFixed(0)} m²`} />
        </div>
      ) : null}
      <OptionGrid
        group={OPTION_GROUP[part]}
        label={t(partLabelKey(part))}
        options={PART_VALUES[part]}
        value={String(config[field])}
        isDisabled={(value) => isOptionLocked(part, value, config)}
        onChange={(value) => onChange(optionPatch(part, value, config))}
      />
      {part === 'roof' ? (
        <div className="space-y-1 pt-1">
          <DimensionRow config={config} rowKey="eavesHeight" label={t('left.eaves')} onChange={onChange} />
          <DimensionRow config={config} rowKey="ridgeHeight" label={t('left.ridge')} onChange={onChange} />
        </div>
      ) : null}
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
 * The parts of the shed and the properties of the selected one, over the model on a phone (on a larger screen the
 * design sidebar does this job). Sizes are changed by dragging the model itself; here they can also be typed.
 *
 * Compact, it is a bottom sheet that keeps clear of the grips: a part picked on the model shows as one slim bar
 * with its name, and its options open on request. A part picked from the list opens with its options, since
 * choosing them is what the list is for.
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
        {selected ? t(partLabelKey(selected)) : t('viewport.properties')}
      </Button>
    );
  }

  const heading = (part: EditablePart) => (
    <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400">
        <ShedTabIcon tab={part} className="h-3.5 w-3.5" />
      </span>
      <span className="truncate">{t(partLabelKey(part))}</span>
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
          className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
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
                  compact ? 'items-center gap-1.5 px-2 py-1.5 text-left text-xs' : 'min-w-0 flex-col items-center gap-0.5 px-1 py-1 text-[12px] leading-tight',
                  active ? 'bg-orange-500 text-white' : 'text-foreground hover:bg-muted'
                )}
                title={compact ? undefined : t(partLabelKey(part))}
              >
                <ShedTabIcon tab={part} className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-full truncate">{t(partLabelKey(part))}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {selected ? (
        <section
          key={selected}
          className="min-h-0 flex-1 overflow-y-auto p-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200"
          aria-label={t(partLabelKey(selected))}
          data-testid="part-editor"
          data-part={selected}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            {heading(selected)}
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSelect(null)} aria-label={t('edit.close')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <PartBody part={selected} config={config} onChange={onChange} />
        </section>
      ) : (
        <p className={cn('px-2.5 text-[12px] leading-snug text-muted-foreground', compact ? 'py-1.5' : 'py-2.5')}>{t('viewport.nothingSelected')}</p>
      )}
    </aside>
  );
}
