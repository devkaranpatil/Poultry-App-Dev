import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

interface CountUpProps {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}

/** Counts from 0 to `to` the first time it scrolls into view (shows the final value without IntersectionObserver). */
export function CountUp(props: CountUpProps) {
  if (typeof IntersectionObserver === "undefined") {
    const { to, decimals = 0, prefix = "", suffix = "" } = props;
    return <span>{`${prefix}${to.toFixed(decimals)}${suffix}`}</span>;
  }
  return <AnimatedCountUp {...props} />;
}

function AnimatedCountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.6,
}: CountUpProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(reduce ? to : 0);

  useEffect(() => {
    if (reduce) {
      setValue(to);
      return;
    }
    if (!inView) return;
    const controls = animate(0, to, { duration, ease: "easeOut", onUpdate: setValue });
    return () => controls.stop();
  }, [inView, reduce, to, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
