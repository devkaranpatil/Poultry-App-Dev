import { APP_NAME } from '@/config/app';
import { cn } from '@/lib/utils';

/**
 * Brand mark: an open-sided shed (two posts under a gable roof) with the sun rising inside it, on forest green.
 * Drawn with theme tokens so it follows light and dark mode; public/favicon.svg is the same drawing in fixed colours.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <circle cx="16" cy="22" r="5.2" className="fill-straw" />
      <rect x="4" y="22" width="24" height="6" className="fill-primary" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-foreground">
        <path d="M5.5 15.2 16 8l10.5 7.2" strokeWidth="2.6" />
        <path d="M9 14v8M23 14v8" strokeWidth="2" />
        <path d="M6 22.5h20" strokeWidth="2" />
      </g>
    </svg>
  );
}

/** The mark and the product name (APP_NAME from shared/app.json) in the heading face. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={compact ? 'h-7 w-7' : undefined} />
      <span className="whitespace-nowrap pt-1 font-display text-[17px] font-extrabold leading-none text-foreground">
        {APP_NAME}
      </span>
    </span>
  );
}
