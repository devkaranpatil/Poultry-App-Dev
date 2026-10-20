import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type FarmConfig } from '@/types/farm';
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  MERGE_WINDOW_MS,
  configMatches,
  diffConfig,
  record,
  redo,
  undo,
  type HistoryEntry,
} from '@/lib/editHistory';

// 14 x 7 m, gable, broilers on manual feeding, a door with a footbath.
const base: FarmConfig = { ...DEFAULT_CONFIG, state: 'Maharashtra', district: 'Nagpur' };
const step = (prev: FarmConfig, patch: Partial<FarmConfig>, at: number, group?: string) => {
  const entry = diffConfig(prev, { ...prev, ...patch }, at) as HistoryEntry;
  return group ? { ...entry, group } : entry;
};

describe('diffConfig', () => {
  it('records only the model fields that changed, before and after', () => {
    expect(diffConfig(base, { ...base, length: 40, roofType: 'monitor' }, 5)).toEqual({
      before: { length: 14, roofType: 'gable' },
      after: { length: 40, roofType: 'monitor' },
      at: 5,
    });
  });

  it('ignores the location and unchanged configs', () => {
    expect(diffConfig(base, { ...base, state: 'Kerala' }, 0)).toBeNull();
    expect(diffConfig(base, { ...base, beneficiaryCategory: 'sc-st' }, 0)).toBeNull();
    expect(diffConfig(base, { ...base }, 0)).toBeNull();
  });
});

describe('undo and redo', () => {
  it('undoes a change with a reverse patch and redoes it', () => {
    const history = record(EMPTY_HISTORY, step(base, { birdType: 'desi' }, 0));
    const undone = undo(history)!;
    expect(undone.patch).toEqual({ birdType: 'broiler' });
    expect(undone.state.past).toHaveLength(0);
    const redone = redo(undone.state)!;
    expect(redone.patch).toEqual({ birdType: 'desi' });
    expect(redone.state.future).toHaveLength(0);
  });

  it('has nothing to undo or redo when empty', () => {
    expect(undo(EMPTY_HISTORY)).toBeNull();
    expect(redo(EMPTY_HISTORY)).toBeNull();
  });

  it('folds every step of one drag into a single undo', () => {
    let config = base;
    let history = EMPTY_HISTORY;
    for (const length of [15, 16, 17, 18]) {
      history = record(history, step(config, { length }, length * 1000, 'drag-1'));
      config = { ...config, length };
    }
    expect(history.past).toHaveLength(1);
    expect(undo(history)!.patch).toEqual({ length: 14 });
  });

  it('drops a drag that ends where it started (Esc cancels it)', () => {
    let history = record(EMPTY_HISTORY, step(base, { width: 9 }, 0, 'drag-2'));
    history = record(history, step({ ...base, width: 9 }, { width: 7 }, 10, 'drag-2'));
    expect(history.past).toHaveLength(0);
  });

  it('merges a quick run of slider moves but not separate choices', () => {
    let history = record(EMPTY_HISTORY, step(base, { width: 8 }, 0));
    history = record(history, step({ ...base, width: 8 }, { width: 9 }, MERGE_WINDOW_MS / 2));
    expect(history.past).toHaveLength(1);
    history = record(history, step({ ...base, width: 9 }, { width: 10 }, MERGE_WINDOW_MS * 3));
    expect(history.past).toHaveLength(2);

    let choices = record(EMPTY_HISTORY, step(base, { roofSheet: 'galvalume' }, 0));
    choices = record(choices, step({ ...base, roofSheet: 'galvalume' }, { roofSheet: 'fibre-cement' }, 10));
    expect(choices.past).toHaveLength(2);
  });

  it('clears redo after a new change and caps its length', () => {
    let history = record(EMPTY_HISTORY, step(base, { entry: 'anteroom' }, 0));
    history = undo(history)!.state;
    expect(history.future).toHaveLength(1);
    history = record(history, step(base, { entry: 'single-door' }, 10_000));
    expect(history.future).toHaveLength(0);

    let long = EMPTY_HISTORY;
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      long = record(long, step(base, { feedingSystem: i % 2 ? 'semi-auto' : 'automatic' }, i * 10_000));
    }
    expect(long.past).toHaveLength(HISTORY_LIMIT);
  });

  it('tells when a config already holds a patch', () => {
    expect(configMatches(base, { length: 14, width: 7 })).toBe(true);
    expect(configMatches(base, { length: 15 })).toBe(false);
  });
});
