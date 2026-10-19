/**
 * Lets the export code grab an image of the live 3D model without coupling to
 * the viewer: the viewer registers a capture function while it is mounted.
 */
type SnapshotSource = () => string | null;

let source: SnapshotSource | null = null;

/** Registers the active capture function; returns an unregister callback. */
export function registerModelSnapshot(capture: SnapshotSource): () => void {
  source = capture;
  return () => {
    if (source === capture) source = null;
  };
}

/** A data URL of the current 3D view, or null when no viewer is mounted. */
export function captureModelSnapshot(): string | null {
  try {
    return source?.() ?? null;
  } catch {
    return null;
  }
}
