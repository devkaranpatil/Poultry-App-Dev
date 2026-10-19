import { useEffect, useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring } from "framer-motion";

const INTERACTIVE = 'a, button, [role="button"], input, select, textarea, label[for], summary, [data-interactive]';
const SPOTLIGHT = '.surface, [data-spotlight]';
const SPARKS = 8;

/**
 * App-wide interactivity, mounted once. Everything continuous (pointer position, scroll) goes
 * through motion values, CSS variables or direct DOM writes, never React state.
 *
 *  - scroll progress bar
 *  - cursor follower (the real cursor stays visible), which grows over interactive elements
 *  - click ripple on empty space, sparks on interactive elements
 *  - spotlight: writes --px/--py onto the nearest card/button, CSS paints the glow
 *  - tilt: [data-tilt] elements get --rx/--ry, CSS applies the 3D rotation
 *  - magnetic: [data-magnetic] elements lean toward the pointer
 *
 * Pointer effects only run for fine pointers and are off for reduced motion.
 */
export function InteractionLayer() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 420, damping: 34, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 420, damping: 34, mass: 0.4 });
  const scale = useSpring(1, { stiffness: 300, damping: 22 });
  const burstHost = useRef<HTMLDivElement>(null);
  const cursorVisible = useRef(false);
  const cursorEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce || typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;

    let frame = 0;
    let lastEvent: PointerEvent | null = null;
    let magnet: HTMLElement | null = null;

    const reset = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty("--rx");
      el.style.removeProperty("--ry");
      el.style.removeProperty("--mx");
      el.style.removeProperty("--my");
    };

    const tick = () => {
      frame = 0;
      const e = lastEvent;
      if (!e) return;
      x.set(e.clientX);
      y.set(e.clientY);
      if (!cursorVisible.current && cursorEl.current) {
        cursorVisible.current = true;
        cursorEl.current.style.opacity = "1";
      }

      const target = e.target as Element | null;
      scale.set(target?.closest(INTERACTIVE) ? 1.9 : 1);

      const lit = target?.closest<HTMLElement>(SPOTLIGHT);
      if (lit) {
        const r = lit.getBoundingClientRect();
        lit.style.setProperty("--px", `${e.clientX - r.left}px`);
        lit.style.setProperty("--py", `${e.clientY - r.top}px`);
      }

      const tilt = target?.closest<HTMLElement>("[data-tilt]");
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--rx", `${(-ny * 6).toFixed(2)}deg`);
        tilt.style.setProperty("--ry", `${(nx * 8).toFixed(2)}deg`);
      }

      const mag = target?.closest<HTMLElement>("[data-magnetic]") ?? null;
      if (mag !== magnet) {
        reset(magnet);
        magnet = mag;
      }
      if (mag) {
        const r = mag.getBoundingClientRect();
        mag.style.setProperty("--mx", `${((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1)}px`);
        mag.style.setProperty("--my", `${((e.clientY - (r.top + r.height / 2)) * 0.28).toFixed(1)}px`);
      }
    };

    const onMove = (e: PointerEvent) => {
      lastEvent = e;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onLeaveDoc = () => {
      cursorVisible.current = false;
      if (cursorEl.current) cursorEl.current.style.opacity = "0";
      reset(magnet);
      magnet = null;
    };

    const onOut = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-tilt]");
      if (el && !el.contains(e.relatedTarget as Node | null)) reset(el);
    };

    const onDown = (e: PointerEvent) => {
      scale.set(0.7);
      const host = burstHost.current;
      if (!host) return;
      const onInteractive = Boolean((e.target as Element | null)?.closest(INTERACTIVE));
      const node = document.createElement("span");
      node.className = onInteractive ? "fx-sparks" : "fx-ripple";
      node.style.left = `${e.clientX}px`;
      node.style.top = `${e.clientY}px`;
      if (onInteractive) {
        for (let i = 0; i < SPARKS; i++) {
          const spark = document.createElement("i");
          const angle = (i / SPARKS) * Math.PI * 2;
          spark.style.setProperty("--dx", `${Math.cos(angle) * 26}px`);
          spark.style.setProperty("--dy", `${Math.sin(angle) * 26}px`);
          node.appendChild(spark);
        }
      }
      host.appendChild(node);
      window.setTimeout(() => node.remove(), 700);
    };

    const onUp = () => scale.set(1);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeaveDoc);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerout", onOut);
      document.documentElement.removeEventListener("pointerleave", onLeaveDoc);
    };
  }, [reduce, x, y, scale]);

  return (
    <>
      <motion.div className="fx-progress" style={{ scaleX: progress }} aria-hidden="true" />
      {!reduce && (
        <>
          <div ref={burstHost} className="fx-burst-host" aria-hidden="true" />
          <motion.div
            ref={cursorEl}
            className="fx-cursor"
            style={{ x: sx, y: sy, scale }}
            aria-hidden="true"
          />
        </>
      )}
    </>
  );
}
