import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades and lifts its children in as they scroll into view. Pure CSS (`.reveal` in index.css, a scroll-driven
 * animation), so the content is visible whenever it is on screen and never waits on JavaScript; browsers without
 * scroll timelines and reduced-motion users just see it.
 */
export function Reveal({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return <Tag className={cn("reveal", className)}>{children}</Tag>;
}
