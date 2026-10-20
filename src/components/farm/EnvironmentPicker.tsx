import { Check, CloudRain, MapPin, Moon, Mountain, Sun, Sunset, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/context/I18nContext';
import {
  ENVIRONMENTS,
  SKIES,
  environmentForLocation,
  type EnvironmentChoice,
  type EnvironmentId,
  type SkyId,
} from '@/lib/sceneEnvironment';
import { cn } from '@/lib/utils';

/** A small picture of each landscape for its tile: sky at the top, horizon, ground. */
const SWATCH: Record<EnvironmentId, { sky: string; horizon: string; ground: string }> = {
  plains: { sky: '#bcd9ef', horizon: '#7fa35a', ground: '#6f9a45' },
  deccan: { sky: '#c9dcea', horizon: '#9a7b52', ground: '#a0583a' },
  coastal: { sky: '#a9d4ec', horizon: '#2f7d4a', ground: '#4f8f3a' },
  arid: { sky: '#e3e0cf', horizon: '#d8b878', ground: '#e0c48c' },
  hills: { sky: '#c6d7d2', horizon: '#3f7a4c', ground: '#4c8a43' },
  mountains: { sky: '#b8cfe6', horizon: '#eef3f7', ground: '#5d7f4a' },
};

const SKY_LOOK: Record<SkyId, { icon: LucideIcon; from: string; to: string; ink: string }> = {
  day: { icon: Sun, from: '#8ec5ef', to: '#e6f2fb', ink: '#a16207' },
  golden: { icon: Sunset, from: '#f59e6b', to: '#fde4b8', ink: '#9a3412' },
  overcast: { icon: CloudRain, from: '#94a3b8', to: '#d6dde5', ink: '#334155' },
  night: { icon: Moon, from: '#0f1d3a', to: '#2c3e66', ink: '#e2e8f0' },
};

function Swatch({ id, className }: { id: EnvironmentId; className?: string }) {
  const { sky, horizon, ground } = SWATCH[id];
  return (
    <span
      aria-hidden
      className={cn('block shrink-0 rounded-md border border-black/10', className)}
      style={{ background: `linear-gradient(to bottom, ${sky} 0 45%, ${horizon} 45% 62%, ${ground} 62% 100%)` }}
    />
  );
}

interface EnvironmentPickerProps {
  choice: EnvironmentChoice;
  /** The landscape being drawn (the pick, or the location's own when the pick is Auto). */
  environment: EnvironmentId;
  sky: SkyId;
  state: string;
  district: string;
  onChoiceChange: (choice: EnvironmentChoice) => void;
  onSkyChange: (sky: SkyId) => void;
}

/**
 * Where the shed stands: the landscape around it and the sky over it. Auto follows the
 * location (each state, and some districts, has its own); any other pick stays until changed.
 */
export function EnvironmentPicker({ choice, environment, sky, state, district, onChoiceChange, onSkyChange }: EnvironmentPickerProps) {
  const { t } = useI18n();
  const place = district || state;
  const local = environmentForLocation(state, district);
  const SkyIcon = SKY_LOOK[sky].icon;

  const tile = (active: boolean) =>
    cn(
      'relative flex min-w-0 items-center gap-2 rounded-lg border p-1.5 text-left text-xs transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="glass pointer-events-auto flex h-9 items-center gap-2 rounded-xl px-2 text-xs font-medium text-foreground shadow-soft transition-colors hover:bg-muted/60"
          aria-label={t('scene.picker', { environment: t(`scene.env.${environment}`), sky: t(`scene.sky.${sky}`) })}
          data-testid="environment-picker"
          data-environment={environment}
          data-sky={sky}
        >
          <Swatch id={environment} className="h-5 w-7" />
          <span className="hidden max-w-[9rem] truncate sm:inline">{t(`scene.env.${environment}`)}</span>
          {choice === 'auto' ? (
            <span className="hidden rounded bg-muted px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
              {t('scene.auto')}
            </span>
          ) : null}
          <SkyIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[19rem] space-y-3 p-3" data-testid="environment-panel">
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Mountain className="h-3.5 w-3.5" />
            {t('scene.landscape')}
          </h3>
          <div role="radiogroup" aria-label={t('scene.landscape')} className="space-y-1.5">
            <button type="button" role="radio" aria-checked={choice === 'auto'} onClick={() => onChoiceChange('auto')} className={cn(tile(choice === 'auto'), 'w-full')}>
              <MapPin className="ml-1 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">{t('scene.auto')}</span>
                <span className="block truncate text-[11px]">
                  {place ? t('scene.autoFor', { environment: t(`scene.env.${local}`), place }) : t('scene.autoNoPlace')}
                </span>
              </span>
              {choice === 'auto' ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              {ENVIRONMENTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={choice === id}
                  onClick={() => onChoiceChange(id)}
                  title={t(`scene.envDesc.${id}`)}
                  className={tile(choice === id)}
                >
                  <Swatch id={id} className="h-7 w-9" />
                  <span className="min-w-0 truncate font-medium">{t(`scene.env.${id}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{t(`scene.envDesc.${environment}`)}</p>
        </section>

        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sun className="h-3.5 w-3.5" />
            {t('scene.skyTitle')}
          </h3>
          <div role="radiogroup" aria-label={t('scene.skyTitle')} className="grid grid-cols-4 gap-1.5">
            {SKIES.map((id) => {
              const look = SKY_LOOK[id];
              const Icon = look.icon;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={sky === id}
                  aria-label={t(`scene.sky.${id}`)}
                  onClick={() => onSkyChange(id)}
                  className={cn(tile(sky === id), 'flex-col gap-1 px-1 text-center')}
                >
                  <span
                    aria-hidden
                    className="flex h-7 w-full items-center justify-center rounded-md"
                    style={{ background: `linear-gradient(to bottom, ${look.from}, ${look.to})`, color: look.ink }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="w-full truncate text-[10.5px] leading-tight">{t(`scene.sky.${id}`)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </PopoverContent>
    </Popover>
  );
}
