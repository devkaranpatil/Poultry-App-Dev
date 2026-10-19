import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";

/**
 * Hero photo with scroll parallax, a slow "breathing" zoom and mouse-driven 3D tilt.
 * `floating` content (the preview card) bobs gently above it on a separate depth layer.
 */
export function HeroMedia({ src, alt, floating }: { src: string; alt: string; floating?: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const imageY = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-7, 7]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), { stiffness: 120, damping: 18 });

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className="relative [perspective:1100px]"
      initial={reduce ? false : { opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <motion.div style={reduce ? undefined : { rotateX, rotateY }} className="relative [transform-style:preserve-3d]">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border shadow-elevated">
          <motion.img
            src={src}
            alt={alt}
            loading="eager"
            className="absolute inset-0 h-[112%] w-full object-cover"
            style={reduce ? undefined : { y: imageY }}
            animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-amber-200/20" />
          {!reduce && (
            <motion.div
              className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              animate={{ x: ["0%", "480%"] }}
              transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
            />
          )}
        </div>
        {floating ? (
          <motion.div
            className="[transform:translateZ(60px)]"
            animate={reduce ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            {floating}
          </motion.div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
