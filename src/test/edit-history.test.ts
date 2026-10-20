import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type FarmConfig } from '@/components/farm/scene/legacyConfig';
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

const base: FarmConfig = { ...DEFAULT_CONFIG, state: 'Goa', district: 'North Goa' };
const step = (prev: FarmConfig, patch: Partial<FarmConfig>, at: number, group?: string) => {
  const entry = diffConfig(prev, { ...prev, ...patch }, at) as HistoryEntry;
  return group ? { ...entry, group } : entry;
};

describe('diffConfig', () => {
  it('records only the model fields that changed, before and after', () => {
    expect(diffConfig(base, { ...base, length: 40, roofType: 'gothic' }, 5)).toEqual({
      before: { length: 30, roofType: 'gable' },
      after: { length: 40, roofType: 'gothic' },
      at: 5,
    });
  });

  it('ignores the location and unchanged configs', () => {
    expect(diffConfig(base, { ...base, state: 'Kerala' }, 0)).toBeNull();
    expect(diffConfig(base, { ...base }, 0)).toBeNull();
  });
});

describe('undo and redo', () => {
  it('undoes a change with a reverse patch and redoes it', () => {
    const history = record(EMPTY_HISTORY, step(base, { selectedCrop: 'lettuce' }, 0));
    const undone = undo(history)!;
    expect(undone.patch).toEqual({ selectedCrop: 'tomato' });
    expect(undone.state.past).toHaveLength(0);
    const redone = redo(undone.state)!;
    expect(redone.patch).toEqual({ selectedCrop: 'lettuce' });
    expect(redone.state.future).toHaveLength(0);
  });

  it('has nothing to undo or redo when empty', () => {
    expect(undo(EMPTY_HISTORY)).toBeNull();
    expect(redo(EMPTY_HISTORY)).toBeNull();
  });

  it('folds every step of one drag into a single undo', () => {
    let config = base;
    let history = EMPTY_HISTORY;
    for (const length of [31, 32, 33, 34]) {
      history = record(history, step(config, { length }, length * 1000, 'drag-1'));
      config = { ...config, length };
    }
    expect(history.past).toHaveLength(1);
    expect(undo(history)!.patch).toEqual({ length: 30 });
  });

  it('drops a drag that ends where it started (Esc cancels it)', () => {
    let history = record(EMPTY_HISTORY, step(base, { width: 12 }, 0, 'drag-2'));
    history = record(history, step({ ...base, width: 12 }, { width: 10 }, 10, 'drag-2'));
    expect(history.past).toHaveLength(0);
  });

  it('merges a quick run of slider moves but not separate choices', () => {
    let history = record(EMPTY_HISTORY, step(base, { width: 11 }, 0));
    history = record(history, step({ ...base, width: 11 }, { width: 12 }, MERGE_WINDOW_MS / 2));
    expect(history.past).toHaveLength(1);
    history = record(history, step({ ...base, width: 12 }, { width: 13 }, MERGE_WINDOW_MS * 3));
    expect(history.past).toHaveLength(2);

    let choices = record(EMPTY_HISTORY, step(base, { selectedCrop: 'lettuce' }, 0));
    choices = record(choices, step({ ...base, selectedCrop: 'lettuce' }, { selectedCrop: 'gerbera' }, 10));
    expect(choices.past).toHaveLength(2);
  });

  it('clears redo after a new change and caps its length', () => {
    let history = record(EMPTY_HISTORY, step(base, { doorEntry: 'roll-up' }, 0));
    history = undo(history)!.state;
    expect(history.future).toHaveLength(1);
    history = record(history, step(base, { doorEntry: 'curtain' }, 10_000));
    expect(history.future).toHaveLength(0);

    let long = EMPTY_HISTORY;
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      long = record(long, step(base, { selectedCrop: i % 2 ? 'lettuce' : 'gerbera' }, i * 10_000));
    }
    expect(long.past).toHaveLength(HISTORY_LIMIT);
  });

  it('tells when a config already holds a patch', () => {
    expect(configMatches(base, { length: 30, width: 10 })).toBe(true);
    expect(configMatches(base, { length: 31 })).toBe(false);
  });
});
