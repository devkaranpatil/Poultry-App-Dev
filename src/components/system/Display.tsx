import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { formatINR, formatINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Rupees, in lakh/crore form by default. A loss reads as a loss: red, with its minus sign. */
export function Money({
  value,
  compact = true,
  animate = true,
  className,
}: {
  value: number;
  compact?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const format = compact ? formatINRCompact : formatINR;
  const classes = cn("tabular-nums", value < 0 && "text-destructive", className);
  return animate ? <AnimatedNumber value={value} format={format} className={classes} /> : <span className={classes}>{format(value)}</span>;
}

/** A labelled figure: label above, value large, an optional note below. */
export function Stat({
  label,
  value,
  note,
  tone = "default",
  size = "md",
  className,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: "default" | "good" | "bad" | "muted";
  size?: "sm" | "md" | "lg";
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("min-w-0", className)} data-testid={testId}>
      <p className="text-[13px] font-medium leading-snug text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display font-extrabold leading-tight tabular-nums",
          size === "sm" && "text-lg",
          size === "md" && "text-2xl",
          size === "lg" && "text-3xl sm:text-4xl",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </p>
      {note ? <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** The top of a page or step: the question it answers, a short line under it, and its actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
  as: Heading = "h1",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 max-w-2xl">
        <Heading className="font-display text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">{title}</Heading>
        {description ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
