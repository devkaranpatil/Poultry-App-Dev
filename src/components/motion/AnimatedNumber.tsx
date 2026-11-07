import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * Shows a formatted number and, when the value changes, eases from the old value to the new one so the effect of an
 * edit is visible. The text is written straight to the DOM on each frame (no React render per frame); the final text
 * is always rendered, so screen readers, tests and reduced-motion users get the exact value at once.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 0.7,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    const node = ref.current;
    if (!node || reduce || from === value || !Number.isFinite(from) || !Number.isFinite(value)) return;
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
      onComplete: () => {
        node.textContent = format(value);
      },
    });
    return () => {
      controls.stop();
      node.textContent = format(value);
    };
  }, [value, format, reduce, duration]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
