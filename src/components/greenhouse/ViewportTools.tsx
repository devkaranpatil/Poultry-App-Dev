import { Eye, Focus, Home, Keyboard, Pencil, Redo2, Undo2, Video, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/context/I18nContext';
import { SHORTCUTS, type ViewName } from '@/lib/viewportKeys';
import { cn } from '@/lib/utils';

const toolButton = 'h-9 w-9 rounded-lg shadow-soft';

/** View / Edit, as Blender's mode switch. */
export function ModeSwitch({ editMode, onChange }: { editMode: boolean; onChange: (edit: boolean) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={t('viewport.mode')}>
      {[
        { edit: false, label: t('viewport.modeView'), Icon: Eye },
        { edit: true, label: t('viewport.modeEdit'), Icon: Pencil },
      ].map(({ edit, label, Icon }) => {
        const active = editMode === edit;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(edit)}
            className={cn(
              'flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-all duration-200',
              active ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'
            )}
            data-testid={edit ? 'mode-edit' : 'mode-view'}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function UndoRedo({ canUndo, canRedo, onUndo, onRedo }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center">
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!canUndo} onClick={onUndo} aria-label={t('viewport.undo')} title={`${t('viewport.undo')} (Ctrl+Z)`} data-testid="viewport-undo">
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!canRedo} onClick={onRedo} aria-label={t('viewport.redo')} title={`${t('viewport.redo')} (Ctrl+Shift+Z)`} data-testid="viewport-redo">
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface NavigationToolsProps {
  onZoom: (direction: 1 | -1) => void;
  onFrame: () => void;
  onReset: () => void;
  onView: (view: ViewName) => void;
  hasVents: boolean;
  hasClimate: boolean;
  helpOpen: boolean;
  onHelpOpenChange: (open: boolean) => void;
  frameLabel: string;
}

/** The column under the gizmo: zoom, frame selected, home, named views and the shortcut list. */
export function NavigationTools({ onZoom, onFrame, onReset, onView, hasVents, hasClimate, helpOpen, onHelpOpenChange, frameLabel }: NavigationToolsProps) {
  const { t } = useI18n();
  const views: Array<{ view: ViewName; label: string; keys: string }> = [
    { view: 'auto', label: t('middle.overview'), keys: '1' },
    { view: 'front', label: t('middle.front'), keys: '2' },
    { view: 'side', label: t('middle.side'), keys: '3' },
    { view: 'top', label: t('middle.top'), keys: '4' },
    { view: 'inside', label: t('middle.inside'), keys: '5' },
  ];
  const focus: Array<{ view: ViewName; label: string; keys: string; show: boolean }> = [
    { view: 'focus-door', label: t('middle.door'), keys: '6', show: true },
    { view: 'focus-vents', label: t('middle.vents'), keys: '7', show: hasVents },
    { view: 'focus-irrigation', label: t('middle.irrigation'), keys: '8', show: true },
    { view: 'focus-climate', label: t('middle.climate'), keys: '9', show: hasClimate },
  ];
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5" role="toolbar" aria-orientation="vertical" aria-label={t('viewport.navigation')}>
      <Button type="button" variant="secondary" size="icon" className={toolButton} onClick={() => onZoom(1)} aria-label={t('viewport.zoomIn')} title={`${t('viewport.zoomIn')} (+)`}>
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button type="button" variant="secondary" size="icon" className={toolButton} onClick={() => onZoom(-1)} aria-label={t('viewport.zoomOut')} title={`${t('viewport.zoomOut')} (-)`}>
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button type="button" variant="secondary" size="icon" className={toolButton} onClick={onFrame} aria-label={frameLabel} title={`${frameLabel} (F)`} data-testid="viewport-frame">
        <Focus className="h-4 w-4" />
      </Button>
      <Button type="button" variant="secondary" size="icon" className={toolButton} onClick={onReset} aria-label={t('viewport.reset')} title={`${t('viewport.reset')} (R)`}>
        <Home className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="icon" className={toolButton} aria-label={t('viewport.views')} title={t('viewport.views')} data-testid="viewport-views">
            <Video className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="start" className="w-48">
          <DropdownMenuLabel className="text-xs">{t('viewport.views')}</DropdownMenuLabel>
          {views.map(({ view, label, keys }) => (
            <DropdownMenuItem key={view} onSelect={() => onView(view)} className="text-xs">
              {label}
              <kbd className="ml-auto font-mono text-[10px] text-muted-foreground">{keys}</kbd>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {focus
            .filter((item) => item.show)
            .map(({ view, label, keys }) => (
              <DropdownMenuItem key={view} onSelect={() => onView(view)} className="text-xs">
                {label}
                <kbd className="ml-auto font-mono text-[10px] text-muted-foreground">{keys}</kbd>
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={helpOpen} onOpenChange={onHelpOpenChange}>
        <PopoverTrigger asChild>
          <Button type="button" variant="secondary" size="icon" className={cn(toolButton, 'hidden md:inline-flex')} aria-label={t('viewport.help')} title={`${t('viewport.help')} (?)`} data-testid="viewport-help">
            <Keyboard className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-80 p-3" data-testid="shortcut-help">
          <p className="mb-2 text-xs font-semibold text-foreground">{t('viewport.help')}</p>
          <dl className="grid grid-cols-[auto,1fr] items-baseline gap-x-3 gap-y-1.5 text-[11px]">
            {SHORTCUTS.map(({ keys, label }) => (
              <div key={label} className="contents">
                <dt className="flex flex-wrap justify-end gap-1">
                  {keys.map((key) => (
                    <kbd key={key} className="rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-foreground">
                      {key}
                    </kbd>
                  ))}
                </dt>
                <dd className="text-muted-foreground">{t(label)}</dd>
              </div>
            ))}
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  );
}
