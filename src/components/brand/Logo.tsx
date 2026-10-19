import { cn } from '@/lib/utils';

/** Brand mark: a sprout in a rounded square, matching the favicon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M16 26V15" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 17c0-4.4-3.2-7.4-8-7.4 0 4.4 3.2 7.4 8 7.4Z" fill="#b7e4c7" />
      <path d="M16 15c0-4.6 3.4-8 8.6-8 0 4.6-3.4 8-8.6 8Z" fill="white" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={compact ? 'h-7 w-7' : undefined} />
      <span className="whitespace-nowrap font-display text-[17px] font-bold tracking-tight text-foreground">
        Greenhouse <span className="text-primary">IQ</span>
      </span>
    </span>
  );
}
