import { useEffect, useState } from 'react';
import {
  Bird,
  Blinds,
  Box,
  Cog,
  DoorClosed,
  DoorOpen,
  Drumstick,
  Egg,
  Fan,
  Footprints,
  Grid3x3,
  Hand,
  Handshake,
  House,
  Layers,
  Minus,
  Plus,
  Rows3,
  Store,
  Thermometer,
  Triangle,
  Utensils,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import { optionKey } from '@/types/farm';
import { cn } from '@/lib/utils';

/** The sidebar's tabs: the parts of a shed, in the order a farmer decides them, then where it is built. */
export type ShedTab = 'size' | 'housing' | 'roof' | 'frame' | 'roofSheet' | 'sideWalls' | 'entry' | 'birds' | 'feeding' | 'location';

const TAB_ICONS: Record<Exclude<ShedTab, 'location'>, LucideIcon> = {
  size: Box,
  housing: Thermometer,
  roof: Triangle,
  frame: Grid3x3,
  roofSheet: Layers,
  sideWalls: Blinds,
  entry: DoorClosed,
  birds: Bird,
  feeding: Utensils,
};

export function ShedTabIcon({ tab, className }: { tab: Exclude<ShedTab, 'location'>; className?: string }) {
  const Icon = TAB_ICONS[tab];
  return <Icon className={cn('h-4 w-4', className)} aria-hidden />;
}

const ICONS: Record<string, LucideIcon> = {
  'open-sided': Wind,
  'environment-controlled': Fan,
  backyard: House,
  'mesh-curtain': Blinds,
  'mesh-auto-curtain': Zap,
  'closed-tunnel': Fan,
  'single-door': DoorClosed,
  'door-footbath': Footprints,
  anteroom: DoorOpen,
  broiler: Drumstick,
  'layer-cage': Rows3,
  'layer-floor': Egg,
  desi: Bird,
  manual: Hand,
  'semi-auto': Utensils,
  automatic: Cog,
  trough: Rows3,
  independent: Store,
  contract: Handshake,
};

/** Roof profiles as small drawings: the shape is what the farmer is choosing. */
function RoofProfile({ value }: { value: string }) {
  const path =
    value === 'lean-to'
      ? 'M4 26 V18 L40 6 V26'
      : value === 'monitor'
        ? 'M4 26 V16 L17 8 V5 H27 V8 L40 16 V26'
        : 'M4 26 V16 L22 5 L40 16 V26';
  return (
    <svg viewBox="0 0 44 28" className="h-7 w-11" aria-hidden>
      <path d={path} fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <path d="M2 26 H42" stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.5} />
    </svg>
  );
}

const FRAME_SWATCH: Record<string, string> = { 'steel-truss': '#94a3b8', 'rcc-pillars': '#a8a29e', 'bamboo-wood': '#c8a46a' };
const SHEET_SWATCH: Record<string, { fill: string; ribs: boolean }> = {
  'gi-sheet': { fill: '#cbd5e1', ribs: true },
  galvalume: { fill: '#e2e8f0', ribs: true },
  'fibre-cement': { fill: '#a8a29e', ribs: true },
  'puf-panel': { fill: '#f8fafc', ribs: false },
  thatch: { fill: '#d6b46a', ribs: false },
};

function FrameSwatch({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
      <g stroke={fill} strokeWidth={2.5} strokeLinecap="round" fill="none">
        <path d="M4 25 V12 M24 25 V12 M3 12 L14 4 L25 12 Z" />
        <path d="M8 12 L14 4 L20 12" strokeWidth={1.5} />
      </g>
    </svg>
  );
}

function SheetSwatch({ fill, ribs }: { fill: string; ribs: boolean }) {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
      <rect x={2} y={4} width={24} height={20} rx={3} fill={fill} stroke="rgba(15,23,42,0.3)" />
      {ribs ? <path d="M7 4 V24 M12 4 V24 M17 4 V24 M22 4 V24" stroke="rgba(15,23,42,0.25)" strokeWidth={1.2} /> : null}
      {!ribs && fill === '#d6b46a' ? <path d="M4 9 L10 7 M8 14 L16 11 M12 20 L22 16" stroke="#8a6d2a" strokeWidth={1} /> : null}
    </svg>
  );
}

/** A small picture of an option, so choices read at a glance (and without reading English). */
export function ShedOptionThumb({ group, value }: { group: string; value: string | number }) {
  if (group === 'roof') return <RoofProfile value={String(value)} />;
  if (group === 'frame') return <FrameSwatch fill={FRAME_SWATCH[value] ?? '#94a3b8'} />;
  if (group === 'roofSheet') return <SheetSwatch {...(SHEET_SWATCH[value] ?? SHEET_SWATCH['gi-sheet'])} />;
  if (group === 'cageTiers') {
    return (
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
        {Array.from({ length: Number(value) }, (_, i) => (
          <rect key={i} x={4 + i * 2} y={22 - i * 6} width={20 - i * 4} height={4} rx={1} fill="currentColor" fillOpacity={0.3} stroke="currentColor" />
        ))}
      </svg>
    );
  }
  const Icon = ICONS[String(value)] ?? Box;
  return <Icon className="h-6 w-6" aria-hidden />;
}

/** A row of choices with pictures; a choice that does not fit the rest of the shed is shown but cannot be picked. */
export function OptionGrid<T extends string | number>({
  group,
  options,
  value,
  onChange,
  isDisabled,
  label,
}: {
  group: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  isDisabled?: (value: T) => boolean;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1.5">
      {options.map((option) => {
        const selected = value === option;
        const disabled = isDisabled?.(option) ?? false;
        const text = typeof option === 'number' ? t('options.cageTiers.n', { n: option }) : t(optionKey(group, option));
        return (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={text}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              'group flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center text-[11px] font-medium leading-tight transition-all duration-150',
              'disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary))]'
                : 'border-border bg-card text-muted-foreground hover:-translate-y-px hover:border-foreground/30 hover:text-foreground'
            )}
          >
            <span className={cn('transition-transform duration-150', selected ? 'scale-110 text-primary' : 'group-hover:scale-105')}>
              <ShedOptionThumb group={group} value={option} />
            </span>
            <span className="line-clamp-2 w-full">{text}</span>
          </button>
        );
      })}
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

/** A number with nudge buttons and a typed value, snapped to `step` and kept within `min` and `max`. */
export function SizeRow({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = (raw: number) => {
    const snapped = Math.round(Math.min(max, Math.max(min, raw)) / step) * step;
    const clean = Number(snapped.toFixed(2));
    if (clean !== value) onCommit(clean);
    else setDraft(String(value));
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={`edit-size-${id}`} className="min-w-0 truncate text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={value <= min} onClick={() => commit(value - step)} aria-label={`${label} -`}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <input
          id={`edit-size-${id}`}
          type="number"
          inputMode="decimal"
          className="h-7 w-16 rounded-md border border-input bg-background px-1.5 text-center font-mono text-xs tabular-nums"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = Number(draft);
            if (draft.trim() !== '' && Number.isFinite(next)) commit(next);
            else setDraft(String(value));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={value >= max} onClick={() => commit(value + step)} aria-label={`${label} +`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-8 text-[11px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
