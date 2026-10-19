import { motion, useReducedMotion } from "framer-motion";

const LEAVES = [
  { left: "8%", size: 22, delay: 0, duration: 16, drift: 40 },
  { left: "24%", size: 16, delay: 3, duration: 20, drift: -30 },
  { left: "46%", size: 26, delay: 6, duration: 18, drift: 50 },
  { left: "63%", size: 14, delay: 1.5, duration: 22, drift: -45 },
  { left: "81%", size: 20, delay: 4.5, duration: 17, drift: 35 },
  { left: "93%", size: 15, delay: 8, duration: 21, drift: -25 },
];

function Leaf({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 4C9 4 4 10 4 17c0 1 .1 2 .4 3C6 14 10 11 15 10c-4 2-7 5-8.5 10.2 1 .5 2.3.8 3.5.8 7 0 10-6 10-17Z" fill="currentColor" />
    </svg>
  );
}

/** Ambient hero background: drifting light blobs, a faint plant-bed grid, sun rays and falling leaves. */
export function HeroBackdrop() {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl"
        animate={reduce ? undefined : { x: [0, 60, -20, 0], y: [0, 40, 70, 0], scale: [1, 1.15, 0.95, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-32 top-10 h-[26rem] w-[26rem] rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-200/10"
        animate={reduce ? undefined : { x: [0, -50, 20, 0], y: [0, 60, -20, 0], scale: [1, 0.9, 1.12, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <motion.div
        className="absolute -top-40 right-[18%] h-[34rem] w-24 origin-top rotate-[24deg] bg-gradient-to-b from-amber-200/40 to-transparent blur-xl dark:from-amber-100/10"
        animate={reduce ? undefined : { opacity: [0.35, 0.8, 0.35], rotate: [22, 28, 22] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      {!reduce &&
        LEAVES.map((leaf, i) => (
          <motion.span
            key={i}
            className="absolute -top-8 text-primary/35"
            style={{ left: leaf.left }}
            animate={{ y: ["0%", "1600%"], x: [0, leaf.drift, -leaf.drift / 2, leaf.drift], rotate: [0, 120, 240, 360], opacity: [0, 0.9, 0.9, 0] }}
            transition={{ duration: leaf.duration, delay: leaf.delay, repeat: Infinity, ease: "linear" }}
          >
            <Leaf size={leaf.size} />
          </motion.span>
        ))}
    </div>
  );
}
