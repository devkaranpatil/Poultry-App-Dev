import { Bot, Box, FileText, HelpCircle, ListChecks, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/context/I18nContext';
import { markGuideSeen } from '@/lib/guideStorage';

interface WelcomeGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartRecommended: () => void;
}

/** A first visit's map of the app: what it does, the steps, and where help is. */
export function WelcomeGuide({ open, onOpenChange, onStartRecommended }: WelcomeGuideProps) {
  const { t } = useI18n();
  const close = () => {
    markGuideSeen();
    onOpenChange(false);
  };
  const points = [
    { icon: Box, text: t('guide.step1') },
    { icon: ListChecks, text: t('guide.step2') },
    { icon: Bot, text: t('guide.step3') },
    { icon: FileText, text: t('guide.step4') },
    { icon: HelpCircle, text: t('guide.terms') },
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl" data-testid="welcome-guide">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{t('guide.title')}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{t('guide.intro')}</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {points.map(({ icon: Icon, text }, index) => (
            <li key={text} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <p className="pt-1 text-sm leading-relaxed text-foreground">
                {index < 4 ? <span className="mr-1 font-semibold">{index + 1}.</span> : null}
                {text}
              </p>
            </li>
          ))}
        </ol>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={close}>
            {t('guide.startOwn')}
          </Button>
          <Button
            onClick={() => {
              onStartRecommended();
              close();
            }}
          >
            <Wand2 className="mr-1.5 h-4 w-4" />
            {t('guide.startRecommended')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
