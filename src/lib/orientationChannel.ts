type Listener = (rotation: ArrayLike<number>) => void;

/**
 * Carries the camera's orientation (its view matrix) from inside the 3D canvas to overlays outside
 * it, such as the navigation gizmo, without re-rendering React on every frame.
 */
export function createOrientationChannel() {
  const listeners = new Set<Listener>();
  let last: Float32Array | null = null;
  return {
    publish(rotation: ArrayLike<number>) {
      if (last && last.every((value, index) => Math.abs(value - rotation[index]) < 1e-4)) return;
      last = Float32Array.from(rotation);
      listeners.forEach((listener) => listener(rotation));
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      if (last) listener(last);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type OrientationChannel = ReturnType<typeof createOrientationChannel>;
