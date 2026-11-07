import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils';
import { OPTIONAL_STEPS, PHASES, STEPS, phaseOf, type StepId } from './steps';

interface JourneyProps {
  current: StepId;
  onSelect: (step: StepId) => void;
  /** Steps after Design only have figures once the design is complete. */
  designComplete: boolean;
  /** Steps the user has opened, ticked so progress is visible. */
  visited: ReadonlySet<StepId>;
  /** Whether the figures are being worked out again after an edit; null before the design is complete. */
  busy: boolean | null;
}

/** "Updating" or "Up to date", as a dot and a word; the dot alone where there is no room. */
function SyncStatus({ busy, compact = false }: { busy: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const label = busy ? t('app.statusUpdating') : t('right.statusUpToDate');
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-semibold', busy ? 'text-warning' : 'text-success')} title={compact ? label : undefined}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', busy ? 'animate-pulse bg-warning motion-reduce:animate-none' : 'bg-success')} aria-hidden="true" />
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </span>
  );
}

/**
 * The journey as a list grouped into its three phases (plan the shed, check the money, share it): where you are,
 * what is done and what is left. Up and down arrows move between the steps.
 */
function JourneyList({
  current,
  onSelect,
  designComplete,
  visited,
  collapsed = false,
}: Omit<JourneyProps, 'busy'> & { collapsed?: boolean }) {
  const { t } = useI18n();
  const listRef = useRef<HTMLOListElement>(null);
  const hintId = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-step]') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <ol ref={listRef} onKeyDown={onKeyDown} className={cn('flex flex-col', collapsed ? 'gap-3' : 'gap-5')}>
      {PHASES.map((phase, phaseIndex) => (
        <li key={phase.id}>
          {collapsed ? (
            phaseIndex > 0 ? <span className="mx-auto mb-3 block h-px w-6 bg-border" aria-hidden="true" /> : null
          ) : (
            <p className="mb-1.5 px-3 text-[12.5px] font-semibold text-muted-foreground" id={`${hintId}-${phase.id}`}>
              {t(`ws.phase.${phase.id}`)}
            </p>
          )}
          <ol className="flex flex-col gap-0.5" aria-labelledby={collapsed ? undefined : `${hintId}-${phase.id}`}>
            {phase.steps.map((step) => {
              const index = STEPS.indexOf(step);
              const active = step === current;
              const locked = step !== 'design' && !designComplete;
              const done = !active && designComplete && visited.has(step);
              const optional = OPTIONAL_STEPS.has(step);
              const hint = [done ? t('ws.doneHint') : null, locked ? t('ws.lockedHint') : null, optional ? t('ws.optional') : null]
                .filter(Boolean)
                .join('. ');
              const button = (
                <button
                  type="button"
                  data-step={step}
                  id={`step-tab-${step}`}
                  aria-current={active ? 'step' : undefined}
                  aria-label={t(`ws.steps.${step}`)}
                  aria-describedby={hint ? `${hintId}-${step}` : undefined}
                  onClick={() => onSelect(step)}
                  className={cn(
                    'group flex min-h-11 w-full items-center gap-3 rounded-lg text-left text-[15px] transition-[background-color,color] duration-150 active:scale-[0.99]',
                    collapsed ? 'justify-center px-0' : 'px-3',
                    active ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                    locked && !active && 'text-muted-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : done
                          ? 'bg-primary/15 text-primary'
                          : locked
                            ? 'border border-dashed border-input text-muted-foreground'
                            : 'border border-input bg-card text-muted-foreground'
                    )}
                    aria-hidden="true"
                  >
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                  </span>
                  {collapsed ? null : (
                    <>
                      <span className="min-w-0 flex-1 truncate" aria-hidden="true">
                        {t(`ws.steps.${step}`)}
                      </span>
                      {optional ? (
                        <span className="shrink-0 rounded-full bg-secondary px-2 text-[11.5px] font-semibold leading-5 text-muted-foreground" aria-hidden="true">
                          {t('ws.optional')}
                        </span>
                      ) : null}
                    </>
                  )}
                  {hint ? (
                    <span id={`${hintId}-${step}`} className="sr-only">
                      {hint}
                    </span>
                  ) : null}
                </button>
              );
              return (
                <li key={step}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{button}</TooltipTrigger>
                      <TooltipContent side="right">{t(`ws.steps.${step}`)}</TooltipContent>
                    </Tooltip>
                  ) : (
                    button
                  )}
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}

/** Laptop: the journey down the left, folding to its numbers when the 3D model or a table wants the width. */
export function JourneyRail({ collapsed, onCollapsedChange, busy, ...list }: JourneyProps & { collapsed: boolean; onCollapsedChange: (next: boolean) => void }) {
  const { t } = useI18n();
  const toggleLabel = collapsed ? t('ws.railExpand') : t('ws.railCollapse');
  return (
    <aside
      className={cn('t-resize flex shrink-0 flex-col overflow-hidden border-r border-border bg-card', collapsed ? 'w-[72px]' : 'w-[256px]')}
      data-testid="journey-rail"
    >
      <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between pl-6 pr-3')}>
        {collapsed ? null : <p className="font-display text-[15px] font-bold text-foreground">{t('ws.journeyTitle')}</p>}
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>
      <nav aria-label={t('ws.stepsNav')} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <JourneyList {...list} collapsed={collapsed} />
      </nav>
      {busy !== null ? (
        <div className={cn('shrink-0 border-t border-border py-3', collapsed ? 'flex justify-center' : 'px-6')}>
          <SyncStatus busy={busy} compact={collapsed} />
        </div>
      ) : null}
    </aside>
  );
}

/**
 * Phone and tablet: one line saying where you are, a thin progress line, and every step in a sheet from the bottom,
 * so the steps never scroll off sideways.
 */
export function JourneySwitcher({ busy, ...list }: JourneyProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { current } = list;
  const position = t('ws.stepOf', { n: STEPS.indexOf(current) + 1, total: STEPS.length });

  return (
    <div className="shrink-0 border-b border-border bg-card px-3 pb-2.5 pt-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="journey-switcher"
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left transition-colors active:bg-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-muted-foreground">
              {position} · {t(`ws.phase.${phaseOf(current)}`)}
            </span>
            <span className="block truncate text-[16px] font-semibold leading-snug text-foreground">{t(`ws.steps.${current}`)}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12.5px] font-semibold text-foreground">
            {t('ws.openSteps')}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </button>
        {busy !== null ? <SyncStatus busy={busy} /> : null}
      </div>
      <div className="mt-1.5 flex gap-2.5 px-1" aria-hidden="true">
        {PHASES.map((phase) => (
          <div key={phase.id} className="flex flex-1 gap-1" style={{ flexGrow: phase.steps.length }}>
            {phase.steps.map((step) => {
              const reached = STEPS.indexOf(step) <= STEPS.indexOf(current) || (list.designComplete && list.visited.has(step));
              return (
                <span
                  key={step}
                  className={cn('h-1 flex-1 rounded-full transition-colors duration-200', step === current ? 'bg-primary' : reached ? 'bg-primary/40' : 'bg-border')}
                />
              );
            })}
          </div>
        ))}
      </div>

      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle className="font-display text-lg">{t('ws.journeyTitle')}</DrawerTitle>
            <DrawerDescription>{position}</DrawerDescription>
          </DrawerHeader>
          <nav aria-label={t('ws.stepsNav')} className="overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <JourneyList
              {...list}
              onSelect={(step) => {
                setOpen(false);
                list.onSelect(step);
              }}
            />
          </nav>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
