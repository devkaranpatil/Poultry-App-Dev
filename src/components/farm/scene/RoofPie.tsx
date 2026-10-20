import { Html } from '@react-three/drei';
import type { FarmConfig } from '@/components/farm/scene/legacyConfig';
import { PART_VALUES, roofPatch } from '@/lib/sceneEdit';
import { cn } from '@/lib/utils';
import { OptionThumb } from '../OptionThumb';

interface RoofPieProps {
  config: FarmConfig;
  onChange: (patch: Partial<FarmConfig>) => void;
  labels: Record<string, string>;
  title: string;
  touch: boolean;
}

/** Where each roof shape sits around the pie, in degrees (0 = right, 90 = up). */
const ANGLES: Record<string, number> = { flat: 200, gable: 90, gothic: -20 };

/**
 * Blender's pie menu, anchored on the roof: grab the roof and flick it to a shape. It floats just
 * above the far end of the ridge, clear of the height grip at the near end.
 */
export function RoofPie({ config, onChange, labels, title, touch }: RoofPieProps) {
  const radius = touch ? 62 : 54;
  const button = touch ? 52 : 44;
  return (
    <Html
      position={[0, config.ridgeHeight + 1.2, -config.length * 0.25]}
      center
      zIndexRange={[25, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="relative animate-in fade-in-0 zoom-in-75 duration-200"
        style={{ width: radius * 2 + button, height: radius * 2 + button }}
        role="radiogroup"
        aria-label={title}
        data-testid="roof-pie"
      >
        {/* The pie's centre: a dot and a faint ring, as in Blender. */}
        <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow" />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50"
          style={{ width: radius * 1.3, height: radius * 1.3 }}
        />
        {PART_VALUES.roof.map((value) => {
          const angle = (ANGLES[value] * Math.PI) / 180;
          const x = Math.cos(angle) * radius;
          const y = -Math.sin(angle) * radius;
          const selected = config.roofType === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={labels[value]}
              title={labels[value]}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (!selected) onChange(roofPatch(value, config));
              }}
              className={cn(
                'pointer-events-auto absolute flex flex-col items-center justify-center rounded-full border text-[9px] font-semibold shadow-elevated transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-orange-400 bg-orange-500 text-white'
                  : 'border-border bg-card/95 text-foreground hover:scale-110 hover:border-orange-400'
              )}
              style={{
                width: button,
                height: button,
                left: `calc(50% + ${x}px - ${button / 2}px)`,
                top: `calc(50% + ${y}px - ${button / 2}px)`,
              }}
            >
              <span className="scale-75">
                <OptionThumb part="roof" value={value} />
              </span>
            </button>
          );
        })}
      </div>
    </Html>
  );
}
