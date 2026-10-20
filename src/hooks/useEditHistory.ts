import { useCallback, useEffect, useRef, useState } from 'react';
import type { FarmConfig } from '@/types/farm';
import {
  EMPTY_HISTORY,
  configMatches,
  diffConfig,
  record,
  redo as redoStep,
  undo as undoStep,
  type ConfigPatch,
  type HistoryState,
} from '@/lib/editHistory';

/**
 * Undo and redo for the model. It watches the config, so changes from the setup form, the
 * properties panel and drags in the 3D view are all undoable; the view only needs a way to apply
 * a patch. Changes made between beginGroup and endGroup (one drag) undo as a single step.
 */
export function useEditHistory(config: FarmConfig, apply: ((patch: ConfigPatch) => void) | undefined, enabled: boolean) {
  const historyRef = useRef<HistoryState>(EMPTY_HISTORY);
  const lastConfigRef = useRef<FarmConfig | null>(null);
  const expectedRef = useRef<ConfigPatch | null>(null);
  const groupRef = useRef<string | undefined>(undefined);
  const groupCounter = useRef(0);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((value) => value + 1);

  useEffect(() => {
    const previous = lastConfigRef.current;
    lastConfigRef.current = config;
    // The first config seen (and anything before the model is shown) is the starting point.
    if (!previous || !enabled) return;
    const expected = expectedRef.current;
    expectedRef.current = null;
    if (expected && configMatches(config, expected)) return; // our own undo or redo landing
    const entry = diffConfig(previous, config, Date.now());
    if (!entry) return;
    historyRef.current = record(historyRef.current, groupRef.current ? { ...entry, group: groupRef.current } : entry);
    bump();
  }, [config, enabled]);

  const run = useCallback(
    (step: typeof undoStep) => {
      if (!apply) return false;
      const result = step(historyRef.current);
      if (!result) return false;
      historyRef.current = result.state;
      // A patch that changes nothing never re-runs the effect, so it must not be left waiting there.
      const current = lastConfigRef.current;
      expectedRef.current = current && configMatches(current, result.patch) ? null : result.patch;
      apply(result.patch);
      bump();
      return true;
    },
    [apply]
  );

  const undo = useCallback(() => run(undoStep), [run]);
  const redo = useCallback(() => run(redoStep), [run]);

  const beginGroup = useCallback(() => {
    groupCounter.current += 1;
    groupRef.current = `group-${groupCounter.current}`;
  }, []);
  // Changes still being rendered from the last pointer move belong to the group too, so it closes a little later.
  const endGroup = useCallback(() => {
    const closing = groupRef.current;
    window.setTimeout(() => {
      if (groupRef.current === closing) groupRef.current = undefined;
    }, 150);
  }, []);

  return {
    undo,
    redo,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
    beginGroup,
    endGroup,
  };
}
