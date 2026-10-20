import { APP_NAME } from '@/config/app';
import { cn } from '@/lib/utils';

/** Brand mark: an egg under a shed roof in a rounded square, matching the favicon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M6 14.5 16 7l10 7.5" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12.5c3 0 5.2 4.2 5.2 7.3a5.2 5.2 0 0 1-10.4 0c0-3.1 2.2-7.3 5.2-7.3Z" fill="#fde68a" />
    </svg>
  );
}

/** The product name, its last word in the brand colour (APP_NAME from shared/app.json). */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  const words = APP_NAME.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={compact ? 'h-7 w-7' : undefined} />
      <span className="whitespace-nowrap font-display text-[17px] font-bold tracking-tight text-foreground">
        {words.join(' ')}
        {last ? (
          <>
            {' '}
            <span className="text-primary">{last}</span>
          </>
        ) : null}
      </span>
    </span>
  );
}
