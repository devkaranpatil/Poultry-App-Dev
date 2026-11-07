import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Native select and number inputs styled like the Input primitive (used where Radix Select would be overkill). */
export const fieldControlClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] text-foreground transition-colors hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

/** A form field: label above the control, help text and the error below it. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] leading-snug text-destructive">
          {error}
        </p>
      ) : help ? (
        <p className="text-[13px] leading-snug text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
