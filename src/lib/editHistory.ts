import type { FarmConfig } from '@/types/farm';

export type ConfigPatch = Partial<FarmConfig>;

/** One undoable step: the values of the changed fields before and after it. */
export interface HistoryEntry {
  before: ConfigPatch;
  after: ConfigPatch;
  /** When the step was recorded (ms). */
  at: number;
  /** Changes made under the same group (one drag) undo as one step. */
  group?: string;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/** The fields that describe the model. The location is not undone from the 3D view. */
export const HISTORY_KEYS: Array<keyof FarmConfig> = [
  'length',
  'width',
  'gutterHeight',
  'ridgeHeight',
  'greenhouseType',
  'roofType',
  'structureMaterial',
  'coverMaterial',
  'sideVentilation',
  'doorEntry',
  'selectedCrop',
  'irrigationSystem',
];

const DIMENSION_KEYS = new Set<keyof FarmConfig>(['length', 'width', 'gutterHeight', 'ridgeHeight']);

/** Slider and number changes this close together count as one step. */
export const MERGE_WINDOW_MS = 800;
export const HISTORY_LIMIT = 100;

export const EMPTY_HISTORY: HistoryState = { past: [], future: [] };

const assign = (patch: ConfigPatch, key: keyof FarmConfig, value: unknown) => {
  (patch as Record<string, unknown>)[key] = value;
};

/** The step between two configs, or null when no model field changed. */
export function diffConfig(
  prev: FarmConfig,
  next: FarmConfig,
  at: number,
  keys: Array<keyof FarmConfig> = HISTORY_KEYS
): HistoryEntry | null {
  const before: ConfigPatch = {};
  const after: ConfigPatch = {};
  for (const key of keys) {
    if (prev[key] !== next[key]) {
      assign(before, key, prev[key]);
      assign(after, key, next[key]);
    }
  }
  return Object.keys(after).length > 0 ? { before, after, at } : null;
}

const sameKeys = (a: ConfigPatch, b: ConfigPatch) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((key, index) => key === kb[index]);
};

const onlyDimensions = (patch: ConfigPatch) =>
  Object.keys(patch).every((key) => DIMENSION_KEYS.has(key as keyof FarmConfig));

/** Folds a later step into an earlier one; null when the two cancel out. */
function merge(first: HistoryEntry, second: HistoryEntry): HistoryEntry | null {
  const before: ConfigPatch = { ...second.before, ...first.before };
  const after: ConfigPatch = { ...first.after, ...second.after };
  for (const key of Object.keys(after) as Array<keyof FarmConfig>) {
    if (before[key] === after[key]) {
      delete before[key];
      delete after[key];
    }
  }
  if (Object.keys(after).length === 0) return null;
  return { before, after, at: second.at, group: first.group };
}

function shouldMerge(last: HistoryEntry, entry: HistoryEntry): boolean {
  if (last.group || entry.group) return last.group === entry.group;
  return (
    entry.at - last.at < MERGE_WINDOW_MS &&
    sameKeys(last.after, entry.after) &&
    onlyDimensions(entry.after)
  );
}

/** Adds a step. A new step clears the redo list. */
export function record(state: HistoryState, entry: HistoryEntry): HistoryState {
  const last = state.past[state.past.length - 1];
  if (last && shouldMerge(last, entry)) {
    const merged = merge(last, entry);
    const past = state.past.slice(0, -1);
    return { past: merged ? [...past, merged] : past, future: [] };
  }
  const past = [...state.past, entry];
  return { past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, future: [] };
}

/** Takes back the latest step: the patch to apply and the history after it. */
export function undo(state: HistoryState): { state: HistoryState; patch: ConfigPatch } | null {
  const entry = state.past[state.past.length - 1];
  if (!entry) return null;
  return {
    state: { past: state.past.slice(0, -1), future: [...state.future, { ...entry, group: undefined }] },
    patch: entry.before,
  };
}

/** Re-applies the latest undone step. */
export function redo(state: HistoryState): { state: HistoryState; patch: ConfigPatch } | null {
  const entry = state.future[state.future.length - 1];
  if (!entry) return null;
  return {
    state: { past: [...state.past, { ...entry, group: undefined }], future: state.future.slice(0, -1) },
    patch: entry.after,
  };
}

/** True when the config already holds every value of a patch. */
export function configMatches(config: FarmConfig, patch: ConfigPatch): boolean {
  return (Object.keys(patch) as Array<keyof FarmConfig>).every((key) => config[key] === patch[key]);
}
