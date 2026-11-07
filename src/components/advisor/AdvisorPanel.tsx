import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, Bot, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import type { AiAssistant } from '@/hooks/useAiAssistant';
import { cn } from '@/lib/utils';
import type { StepId } from '@/components/workspace/steps';
import { AdvisorChat } from './AdvisorChat';

/**
 * Where the advisor opens: docked beside the step on a laptop (the step stays readable), a sheet over the side on a
 * tablet, and a page of its own on a phone, which the phone's back button closes.
 */
export type AdvisorLayout = 'dock' | 'sheet' | 'page';

interface AdvisorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: AdvisorLayout;
  /** Missing when the user is signed out. */
  ai?: AiAssistant;
  ready: boolean;
  /** The step the user is on, so the example questions fit what they are looking at. */
  step: StepId;
  /** Opens the AI summary step, where the full project review is. */
  onOpenSummary: () => void;
  /** Where focus goes back to when the advisor closes: the menu that opened it. */
  returnFocusTo?: RefObject<HTMLElement>;
}

/** Long enough for the docked panel's close to finish before its content is unmounted. */
const DOCK_CLOSE_MS = 360;
const DOCK_WIDTH = 'clamp(360px, 28vw, 420px)';

export function AdvisorPanel({ open, onOpenChange, layout, ai, ready, step, onOpenSummary, returnFocusTo }: AdvisorPanelProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const stepName = t(`ws.steps.${step}`);
  const suggestions = [t(`ai.suggest.${step}.1`), t(`ai.suggest.${step}.2`), t('ai.suggest1')].filter(
    (question, index, all) => all.indexOf(question) === index
  );

  const close = () => onOpenChange(false);
  const openSummary = () => {
    onOpenSummary();
    // Docked, the summary shows beside the chat; anywhere else the chat covers it, so it steps aside.
    if (layout !== 'dock') close();
  };

  const chat = (
    <AdvisorChat
      ai={ai}
      ready={ready}
      suggestions={suggestions}
      draft={draft}
      onDraftChange={setDraft}
      inputRef={inputRef}
      onOpenSummary={step === 'summary' ? undefined : openSummary}
      wide={layout === 'page'}
    />
  );

  if (layout === 'dock') {
    return (
      <DockedAdvisor open={open} onClose={close} titleId={titleId} inputRef={inputRef} returnFocusTo={returnFocusTo}>
        {chat}
      </DockedAdvisor>
    );
  }

  const page = layout === 'page';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {page ? null : (
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(160_30%_5%/0.45)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        )}
        <DialogPrimitive.Content
          data-testid="advisor-panel"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusTo?.current?.focus();
          }}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-background outline-none',
            '[animation-timing-function:var(--panel-ease)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:[animation-duration:var(--panel-close-dur)] data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:[animation-duration:var(--panel-open-dur)] motion-reduce:animate-none',
            page ? 'inset-0 h-dvh' : 'inset-y-0 right-0 w-[min(420px,100vw)] border-l border-border shadow-2xl'
          )}
        >
          {page ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-2 py-1.5 pt-[calc(env(safe-area-inset-top)+6px)]">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" className="h-11 gap-1.5 px-2.5 text-[15px] font-medium" aria-label={t('advisor.backTo', { step: stepName })}>
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  {stepName}
                </Button>
              </DialogPrimitive.Close>
              <DialogPrimitive.Title className="ml-auto mr-2 truncate font-display text-[15px] font-bold text-foreground">
                {t('ws.advisorTitle')}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">{t('ws.advisorDesc')}</DialogPrimitive.Description>
            </div>
          ) : (
            <PanelHeader
              title={<DialogPrimitive.Title className="truncate font-display text-[15px] font-bold text-foreground">{t('ws.advisorTitle')}</DialogPrimitive.Title>}
              description={<DialogPrimitive.Description className="truncate text-[12.5px] text-muted-foreground">{t('ws.advisorDesc')}</DialogPrimitive.Description>}
              onClose={close}
            />
          )}
          <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">{chat}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PanelHeader({ title, description, onClose }: { title: ReactNode; description: ReactNode; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card pl-4 pr-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {title}
        {description}
      </div>
      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onClose} aria-label={t('advisor.close')} title={t('advisor.close')}>
        <X className="h-[18px] w-[18px]" />
      </Button>
    </div>
  );
}

/**
 * The laptop panel: a column beside the step that eases open (it pushes the step over rather than covering it) while
 * the panel slides in. It is not modal, so the step stays usable; Esc inside it closes it.
 */
function DockedAdvisor({
  open,
  onClose,
  titleId,
  inputRef,
  returnFocusTo,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  inputRef: RefObject<HTMLTextAreaElement>;
  returnFocusTo?: RefObject<HTMLElement>;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [rendered, setRendered] = useState(open);
  const [entered, setEntered] = useState(open);
  const wasOpen = useRef(open);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
      // Two frames: the panel is in the page at its closed position before it moves, so the slide runs.
      let second = 0;
      const first = window.requestAnimationFrame(() => {
        second = window.requestAnimationFrame(() => {
          setEntered(true);
          // No question box while the advisor cannot answer yet: focus the panel, so Esc still closes it.
          (inputRef.current ?? panelRef.current)?.focus();
        });
      });
      wasOpen.current = true;
      return () => {
        window.cancelAnimationFrame(first);
        window.cancelAnimationFrame(second);
      };
    }
    setEntered(false);
    if (wasOpen.current) {
      wasOpen.current = false;
      // Focus was inside the panel that is going away: hand it back to the menu that opened it.
      if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-testid="advisor-panel"]')) {
        returnFocusTo?.current?.focus();
      }
    }
    const timer = window.setTimeout(() => setRendered(false), DOCK_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open, inputRef, returnFocusTo]);

  // Esc with focus anywhere in the panel closes it. Listened for before other layers (menus, tooltips) can take it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!(document.activeElement instanceof Node) || !panelRef.current?.contains(document.activeElement)) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  return (
    <aside
      aria-labelledby={rendered ? titleId : undefined}
      aria-hidden={rendered ? undefined : true}
      data-testid="advisor-panel"
      data-open={open}
      className={cn('t-dock h-full shrink-0 overflow-hidden bg-background', open && 'border-l border-border')}
      style={{ width: open ? DOCK_WIDTH : 0 }}
    >
      {rendered ? (
        <div ref={panelRef} tabIndex={-1} className="t-panel-slide flex h-full flex-col outline-none" data-open={entered} style={{ width: DOCK_WIDTH }}>
          <PanelHeader
            title={
              <h2 id={titleId} className="truncate font-display text-[15px] font-bold text-foreground">
                {t('ws.advisorTitle')}
              </h2>
            }
            description={<p className="truncate text-[12.5px] text-muted-foreground">{t('ws.advisorDesc')}</p>}
            onClose={onClose}
          />
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      ) : null}
    </aside>
  );
}
