import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils';

/** Tables, sources and fine print, folded away until someone asks for them. */
export function MoreDetails({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <details
      className={cn('group rounded-xl border border-border bg-card', className)}
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        {label ?? (open ? t('ws.hideDetails') : t('ws.showDetails'))}
        <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
