import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bot, ChevronDown, Maximize2, MessageCircle, Minimize2, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AiAssistant } from '@/hooks/useAiAssistant';
import { cn } from '@/lib/utils';
import type { StepId } from '@/components/workspace/steps';
import { AdvisorChat } from './AdvisorChat';

/** Closed to the launcher, a small window above it, or the whole screen. */
export type AdvisorMode = 'closed' | 'window' | 'full';

interface AdvisorWidgetProps {
  /** Missing when the user is signed out. */
  ai?: AiAssistant;
  ready: boolean;
  /** The step the user is on, so the example questions fit what they are looking at. */
  step: StepId;
  /** Opens the AI summary step, where the full project review is. */
  onOpenSummary: () => void;
  /** Pixels at the right taken by a docked panel (the design sidebar); the button and window keep left of it. */
  rightInset?: number;
}

/** The launcher keeps clear of the phone's home bar. */
const LAUNCHER_OFFSET = 'calc(env(safe-area-inset-bottom, 0px) + 20px)';

/** The advisor as a chat bubble in the corner, like a support chat: small by default, full screen on demand. */
export function AdvisorWidget({ ai, ready, step, onOpenSummary, rightInset = 0 }: AdvisorWidgetProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<AdvisorMode>('closed');
  // Minimising remembers whether the chat was full screen; closing starts small again.
  const [reopenAs, setReopenAs] = useState<Exclude<AdvisorMode, 'closed'>>('window');
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousMode = useRef<AdvisorMode>('closed');
  const wasStreaming = useRef(false);
  const titleId = useId();
  const windowId = useId();

  const open = mode !== 'closed';
  const streaming = Boolean(ai?.chatStreaming);
  const suggestions = [t(`ai.suggest.${step}.1`), t(`ai.suggest.${step}.2`), t('ai.suggest1')].filter(
    (question, index, all) => all.indexOf(question) === index,
  );

  // A reply that finishes while the chat is folded away shows as a dot on the launcher.
  useEffect(() => {
    if (wasStreaming.current && !streaming && !open) setUnread(true);
    wasStreaming.current = streaming;
  }, [streaming, open]);
  useEffect(() => {
    if (open) setUnread(false);
  }, [open]);

  // Focus follows the chat: into the question box on open, back to the launcher on close.
  useEffect(() => {
    const before = previousMode.current;
    previousMode.current = mode;
    if (mode === before) return;
    if (mode === 'closed') {
      launcherRef.current?.focus();
      return;
    }
    const frame = window.requestAnimationFrame(() => (inputRef.current ?? document.getElementById(windowId))?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mode, windowId]);

  const minimize = useCallback(() => {
    setMode((current) => {
      if (current !== 'closed') setReopenAs(current);
      return 'closed';
    });
  }, []);
  const close = useCallback(() => {
    setReopenAs('window');
    setMode('closed');
  }, []);

  const openSummary = () => {
    onOpenSummary();
    // On a phone the chat covers the page, and full screen covers it everywhere: step aside so the summary shows.
    if (isMobile) minimize();
    else if (mode === 'full') setMode('window');
  };

  const onWindowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      close();
    }
  };

  const header = (full: boolean) => (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-card px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {full ? (
          <>
            <DialogPrimitive.Title className="truncate text-sm font-semibold text-foreground">{t('ws.advisorTitle')}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="truncate text-[11px] text-muted-foreground">
              {t('ws.advisorDesc')}
            </DialogPrimitive.Description>
          </>
        ) : (
          <>
            <h2 id={titleId} className="truncate text-sm font-semibold text-foreground">
              {t('ws.advisorTitle')}
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">{t('ws.advisorDesc')}</p>
          </>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => setMode(full ? 'window' : 'full')}
        aria-label={full ? t('advisor.collapse') : t('advisor.expand')}
        title={full ? t('advisor.collapse') : t('advisor.expand')}
      >
        {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={minimize}
        aria-label={t('advisor.minimize')}
        title={t('advisor.minimize')}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={close}
        aria-label={t('advisor.close')}
        title={t('advisor.close')}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  const chat = (wide: boolean) => (
    <AdvisorChat
      ai={ai}
      ready={ready}
      suggestions={suggestions}
      draft={draft}
      onDraftChange={setDraft}
      inputRef={inputRef}
      onOpenSummary={step === 'summary' ? undefined : openSummary}
      wide={wide}
    />
  );

  const launcherLabel = [t('advisor.ask'), unread ? t('advisor.newReply') : null, !open && streaming ? t('advisor.typing') : null]
    .filter(Boolean)
    .join('. ');
  const transition = { duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] as const };

  return (
    <>
      <AnimatePresence>
        {mode === 'window' && isMobile ? (
          <motion.div
            key="advisor-backdrop"
            className="fixed inset-0 z-40 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={minimize}
            aria-hidden="true"
          />
        ) : null}
        {mode === 'window' ? (
          <motion.div
            key="advisor-window"
            // No ref here: framer-motion 12 reads child.props.ref, which React 18 warns about.
            id={windowId}
            role="dialog"
            aria-modal={isMobile}
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={onWindowKeyDown}
            data-testid="advisor-window"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.92, y: reduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.92, y: reduceMotion ? 0 : 16 }}
            transition={transition}
            style={{ transformOrigin: 'bottom right', ...(isMobile ? {} : { right: 20 + rightInset }) }}
            className={cn(
              'fixed z-40 flex flex-col overflow-hidden border border-border bg-background shadow-2xl outline-none',
              // Phone: a sheet over most of the screen. Larger screens: a small window above the launcher.
              'inset-x-0 bottom-0 top-[6dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:pb-0',
              'md:inset-auto md:bottom-[88px] md:right-5 md:h-[560px] md:max-h-[calc(100dvh-112px)] md:w-[380px] md:rounded-2xl',
            )}
          >
            {header(false)}
            <div className="min-h-0 flex-1">{chat(false)}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DialogPrimitive.Root open={mode === 'full'} onOpenChange={(next) => (next ? setMode('full') : setMode('window'))}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
          <DialogPrimitive.Content
            data-testid="advisor-fullscreen"
            // Esc steps back to the small window rather than closing the conversation.
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              setMode('window');
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none sm:inset-6 sm:rounded-2xl sm:border sm:border-border lg:inset-x-[max(1.5rem,calc((100vw-64rem)/2))]"
          >
            {header(true)}
            <div className="min-h-0 flex-1">{chat(true)}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {mode !== 'full' && !(isMobile && open) ? (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => (open ? minimize() : setMode(reopenAs))}
          aria-expanded={open}
          aria-controls={open ? windowId : undefined}
          aria-haspopup="dialog"
          aria-label={launcherLabel}
          data-testid="advisor-launcher"
          style={{ bottom: LAUNCHER_OFFSET, right: 20 + rightInset }}
          className="group fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-offset-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          {open ? <ChevronDown className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
          {!open ? (
            <span
              className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:block"
              aria-hidden="true"
            >
              {t('advisor.ask')}
            </span>
          ) : null}
          {!open && streaming ? (
            <span
              className="absolute -right-1 -top-1 flex h-5 items-center gap-0.5 rounded-full border-2 border-background bg-card px-1.5"
              aria-hidden="true"
              data-testid="advisor-typing"
            >
              {[0, 0.15, 0.3].map((delay) => (
                <span
                  key={delay}
                  className="h-1 w-1 animate-bounce rounded-full bg-primary motion-reduce:animate-none"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </span>
          ) : unread ? (
            <span
              className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-destructive"
              aria-hidden="true"
              data-testid="advisor-unread"
            />
          ) : null}
        </button>
      ) : null}
    </>
  );
}
