import { forwardRef, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bot, FolderOpen, HelpCircle, LayoutDashboard, MoreHorizontal, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/context/I18nContext';

interface WorkspaceMenuProps {
  /** Opens the advisor; left out where it is not wanted (designing the shed). */
  onAskAdvisor?: () => void;
  /** A reply finished while the advisor was closed. */
  advisorUnread: boolean;
  onShare?: () => void;
  shareDisabled?: boolean;
  onOpenSaved?: () => void;
  onOpenGuide: () => void;
}

/**
 * Everything the workspace offers besides the journey itself, behind one button: the advisor, the guide and the way
 * back to all projects; on a phone also Share and Saved setups, which have their own buttons on larger screens.
 * The trigger is forwarded so focus can come back to it when the advisor closes.
 */
export const WorkspaceMenu = forwardRef<HTMLButtonElement, WorkspaceMenuProps>(function WorkspaceMenu(
  { onAskAdvisor, advisorUnread, onShare, shareDisabled, onOpenSaved, onOpenGuide },
  ref
) {
  const { t } = useI18n();
  // Choosing the advisor sends focus into its panel; the menu must not pull it back to its button as it closes.
  const focusLeavesMenu = useRef(false);
  const label = advisorUnread ? `${t('ws.moreOptions')}. ${t('ws.replyReady')}` : t('ws.moreOptions');

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button ref={ref} variant="ghost" size="icon" className="relative h-11 w-11 md:h-10 md:w-10" aria-label={label} title={t('ws.moreOptions')} data-testid="workspace-menu">
          <MoreHorizontal className="h-5 w-5" />
          {advisorUnread ? (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" data-testid="advisor-unread" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72"
        onCloseAutoFocus={(event) => {
          if (focusLeavesMenu.current) event.preventDefault();
          focusLeavesMenu.current = false;
        }}
      >
        {onAskAdvisor ? (
          <>
            <DropdownMenuItem
              onSelect={() => {
                focusLeavesMenu.current = true;
                onAskAdvisor();
              }}
              className="items-start gap-3 py-2.5"
              data-testid="ask-advisor"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
                <Bot className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {t('advisor.ask')}
                  {advisorUnread ? (
                    <span className="rounded-full bg-primary px-1.5 text-[11.5px] font-semibold leading-5 text-primary-foreground">{t('ws.replyReady')}</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{t('ws.askAdvisorHint')}</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {onShare ? (
          <DropdownMenuItem onSelect={onShare} disabled={shareDisabled} className="min-h-11">
            <Share2 className="mr-2 h-4 w-4" />
            {t('app.share')}
          </DropdownMenuItem>
        ) : null}
        {onOpenSaved ? (
          <DropdownMenuItem onSelect={onOpenSaved} className="min-h-11">
            <FolderOpen className="mr-2 h-4 w-4" />
            {t('app.savedButton')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onOpenGuide} className="min-h-11">
          <HelpCircle className="mr-2 h-4 w-4" />
          {t('ws.howItWorks')}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11">
          <Link to="/dashboard">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            {t('ws.allProjects')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
