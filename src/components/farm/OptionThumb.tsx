import {
  Apple,
  ArrowUpFromLine,
  ArrowUpToLine,
  Blinds,
  Box,
  Cherry,
  CircleOff,
  CloudFog,
  CloudRain,
  DoorClosed,
  DoorOpen,
  Droplets,
  Flower2,
  Grid3x3,
  Leaf,
  Salad,
  Sprout,
  Thermometer,
  Triangle,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { EditablePart } from '@/lib/sceneEdit';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  none: CircleOff,
  'manual-rollup': ArrowUpFromLine,
  'motorized-rollup': Zap,
  louver: Blinds,
  'single-sliding': DoorClosed,
  'double-sliding': DoorOpen,
  'roll-up': ArrowUpToLine,
  curtain: Wind,
  drip: Droplets,
  sprinkler: CloudRain,
  fogger: CloudFog,
  'hydroponic-nft': Waves,
  tomato: Apple,
  capsicum: Cherry,
  cucumber: Leaf,
  lettuce: Salad,
  strawberry: Cherry,
  gerbera: Flower2,
  'naturally-ventilated': Wind,
  'climate-controlled': Thermometer,
};

const PART_ICONS: Record<EditablePart, LucideIcon> = {
  size: Box,
  roof: Triangle,
  frame: Grid3x3,
  cover: Blinds,
  vents: Wind,
  door: DoorClosed,
  irrigation: Droplets,
  crop: Sprout,
  type: Thermometer,
};

/** The icon for a part in the outliner and panel headers. */
export function PartIcon({ part, className }: { part: EditablePart; className?: string }) {
  const Icon = PART_ICONS[part];
  return <Icon className={cn('h-4 w-4', className)} aria-hidden />;
}

/** Roof profiles as small drawings, the shape being what the farmer is choosing. */
function RoofProfile({ value }: { value: string }) {
  const path =
    value === 'flat'
      ? 'M4 26 V12 H40 V26'
      : value === 'gothic'
        ? 'M4 26 V15 Q8 6 22 3 Q36 6 40 15 V26'
        : 'M4 26 V15 L22 4 L40 15 V26';
  return (
    <svg viewBox="0 0 44 28" className="h-7 w-11" aria-hidden>
      <path d={path} fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <path d="M2 26 H42" stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.5} />
    </svg>
  );
}

const FRAME_SWATCH: Record<string, string> = { 'gi-steel': '#94a3b8', aluminium: '#e2e8f0', bamboo: '#c8a46a' };
const COVER_SWATCH: Record<string, { fill: string; pattern?: 'net' | 'mesh' }> = {
  'uv-polyfilm': { fill: 'rgba(219, 234, 254, 0.75)' },
  'shade-net': { fill: 'rgba(22, 101, 52, 0.7)', pattern: 'net' },
  'insect-net': { fill: 'rgba(241, 245, 249, 0.85)', pattern: 'mesh' },
  glass: { fill: 'rgba(186, 230, 253, 0.6)' },
};

function Swatch({ fill, pattern, frame }: { fill: string; pattern?: 'net' | 'mesh'; frame?: boolean }) {
  const id = `swatch-${pattern ?? 'plain'}`;
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
      {pattern ? (
        <defs>
          <pattern id={id} width={pattern === 'net' ? 4 : 3} height={pattern === 'net' ? 4 : 3} patternUnits="userSpaceOnUse">
            <path d={pattern === 'net' ? 'M0 0 L4 4 M4 0 L0 4' : 'M0 1.5 H3 M1.5 0 V3'} stroke="rgba(15,23,42,0.35)" strokeWidth={0.6} />
          </pattern>
        </defs>
      ) : null}
      {frame ? (
        <g stroke={fill} strokeWidth={3} strokeLinecap="round" fill="none">
          <path d="M5 25 V10 Q14 1 23 10 V25" />
          <path d="M5 16 H23" strokeWidth={2} />
        </g>
      ) : (
        <>
          <rect x={2} y={2} width={24} height={24} rx={5} fill={fill} stroke="rgba(15,23,42,0.25)" />
          {pattern ? <rect x={2} y={2} width={24} height={24} rx={5} fill={`url(#${id})`} /> : null}
          {!pattern ? <path d="M7 8 L12 6 M7 13 L17 9" stroke="#fff" strokeOpacity={0.9} strokeWidth={1.5} strokeLinecap="round" /> : null}
        </>
      )}
    </svg>
  );
}

/** A small picture of an option, so choices read at a glance (and without reading English). */
export function OptionThumb({ part, value }: { part: EditablePart; value: string }) {
  if (part === 'roof') return <RoofProfile value={value} />;
  if (part === 'frame') return <Swatch fill={FRAME_SWATCH[value] ?? '#94a3b8'} frame />;
  if (part === 'cover') {
    const swatch = COVER_SWATCH[value] ?? { fill: '#e2e8f0' };
    return <Swatch fill={swatch.fill} pattern={swatch.pattern} />;
  }
  if (part === 'type' && value === 'shade-net') return <Swatch fill={COVER_SWATCH['shade-net'].fill} pattern="net" />;
  const Icon = ICONS[value] ?? Box;
  return <Icon className="h-6 w-6" aria-hidden />;
}
