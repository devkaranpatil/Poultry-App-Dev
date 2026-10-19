import { useEffect, useState, useRef } from 'react';

// Hook for animating scale with a simple spring/damping curve.
export function useAnimatedScale(target: number, speed: number = 0.1): number {
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const velocityRef = useRef(0);

  useEffect(() => {
    let frameId: number | null = null;

    const animate = () => {
      const diff = target - currentRef.current;
      velocityRef.current += diff * speed;
      velocityRef.current *= 0.8; // Damping

      if (Math.abs(diff) < 0.001 && Math.abs(velocityRef.current) < 0.001) {
        // Settled: snap to the target and stop scheduling frames.
        velocityRef.current = 0;
        currentRef.current = target;
        setCurrent(target);
        frameId = null;
        return;
      }

      currentRef.current += velocityRef.current;
      setCurrent(currentRef.current);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [target, speed]);

  return current;
}
