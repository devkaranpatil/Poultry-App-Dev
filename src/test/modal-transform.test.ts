import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type FarmConfig } from '@/types/farm';
import {
  formatModalLabel,
  liftPatch,
  modalAxes,
  modalChanged,
  modalClick,
  modalKey,
  modalLabel,
  modalPatch,
  modalPointer,
  needsAxis,
  startModal,
  type ModalState,
  type ScreenPoint,
} from '@/lib/modalTransform';
import type { EditablePart } from '@/lib/sceneEdit';
import { resolveViewportKey } from '@/lib/viewportKeys';

// 14 x 7 m, eaves 2.1, ridge 3.5: a rise of 1.4 m.
const config: FarmConfig = { ...DEFAULT_CONFIG };
const centre: ScreenPoint = { x: 500, y: 400 };
const at = (x: number, y = 400): ScreenPoint => ({ x, y });

const begin = (kind: 'grab' | 'scale', base = config, part: EditablePart = 'size') => {
  const state = startModal(kind, part, base, at(600), centre);
  if (!state) throw new Error('modal did not start');
  return state;
};
const keys = (state: ModalState, ...pressed: string[]) => pressed.reduce(modalKey, state);
const english: Record<string, string> = {
  'viewport.modal.grab': 'Grab',
  'viewport.modal.scale': 'Scale',
  'viewport.modal.pickAxis': 'press X, Y or Z',
  'viewport.modal.axis.x': 'X',
  'viewport.modal.axis.y': 'Y',
  'viewport.modal.axis.z': 'Z',
  'viewport.modal.length': 'Length',
  'viewport.modal.width': 'Width',
  'viewport.modal.eaves': 'Eaves',
  'viewport.modal.ridge': 'Ridge',
};
const t = (key: string) => english[key] ?? key;

describe('starting a modal', () => {
  it('only starts for parts with grips', () => {
    expect(startModal('scale', 'entry', config, at(600), centre)).toBeNull();
    expect(startModal('grab', 'birds', config, at(600), centre)).toBeNull();
    expect(startModal('grab', null, config, at(600), centre)).toBeNull();
    expect(begin('scale').status).toBe('active');
  });

  it('offers the axes the grips allow', () => {
    expect(modalAxes('size')).toEqual(['x', 'y', 'z']);
    expect(modalAxes('sideWalls')).toEqual(['x', 'y', 'z']);
    expect(modalAxes('roof')).toEqual(['z']);
    expect(modalAxes('feeding')).toEqual([]);
  });

  it('locks a single-axis part to that axis', () => {
    const roof = begin('grab', config, 'roof');
    expect(roof.axis).toBe('z');
    expect(needsAxis(roof)).toBe(false);
    expect(modalKey(roof, 'z')).toBe(roof); // cannot be freed
    expect(modalKey(roof, 'x')).toBe(roof); // not offered
  });
});

describe('scale', () => {
  it('scales length and width together from the pointer distance', () => {
    // Start 100 px from the centre, move to 150 px: 1.5x.
    const state = modalPointer(begin('scale'), at(650));
    expect(modalPatch(state)).toEqual({ length: 21, width: 10.5, eavesHeight: 2.1, ridgeHeight: 3.5 });
  });

  it('works in any direction from the centre', () => {
    const state = modalPointer(begin('scale'), { x: 500, y: 200 }); // 200 px straight up: 2x
    expect(modalPatch(state)).toMatchObject({ length: 28, width: 14 });
  });

  it('constrains to one axis, and the same axis again frees it', () => {
    let state = modalPointer(begin('scale'), at(700)); // 2x
    state = modalKey(state, 'x');
    expect(state.axis).toBe('x');
    expect(modalPatch(state)).toEqual({ length: 14, width: 14, eavesHeight: 2.1, ridgeHeight: 3.5 });
    state = modalKey(state, 'Y');
    expect(modalPatch(state)).toMatchObject({ length: 28, width: 7 });
    state = modalKey(state, 'y');
    expect(state.axis).toBeNull();
    expect(modalPatch(state)).toMatchObject({ length: 28, width: 14 });
  });

  it('scales the height and keeps the rise', () => {
    const state = keys(begin('scale'), 'z', '1', '.', '2');
    expect(modalPatch(state)).toEqual({ length: 14, width: 7, eavesHeight: 2.5, ridgeHeight: 3.9 });
  });

  it('takes a typed factor over the pointer', () => {
    let state = modalPointer(begin('scale'), at(900));
    state = keys(state, '1', '.', '5');
    expect(state.typed).toBe('1.5');
    expect(modalPatch(state)).toMatchObject({ length: 21, width: 10.5 });
    state = keys(state, 'Backspace', 'Backspace', 'Backspace');
    expect(state.typed).toBe('');
    expect(modalPatch(state)).toMatchObject({ length: 56, width: 18 }); // back to the pointer (4x), the width at its limit
  });

  it('snaps and clamps like a drag', () => {
    expect(modalPatch(keys(begin('scale'), 'x', '1', '.', '2', '6'))).toMatchObject({ width: 9 }); // 8.82 → 9
    expect(modalPatch(keys(begin('scale'), '1', '0'))).toMatchObject({ length: 140, width: 18 });
    expect(modalPatch(keys(begin('scale'), '0', '.', '1'))).toMatchObject({ length: 2, width: 2 });
    expect(modalPatch(keys(begin('scale'), '-', '2'))).toMatchObject({ length: 2, width: 2 });
  });
});

describe('grab', () => {
  it('waits for an axis', () => {
    const state = modalPointer(begin('grab'), at(800));
    expect(needsAxis(state)).toBe(true);
    expect(modalPatch(state)).toEqual({ length: 14, width: 7, eavesHeight: 2.1, ridgeHeight: 3.5 });
    expect(modalLabel(state).hintKey).toBe('viewport.modal.pickAxis');
  });

  it('moves the wall with the pointer, so the width grows twice as much', () => {
    // 40 px further out at 0.05 m/px is 2 m per wall, 4 m in all.
    const state = modalPointer(modalKey(begin('grab'), 'x'), at(640));
    expect(modalPatch(state)).toMatchObject({ width: 11, length: 14 });
  });

  it('raises the eaves as the pointer moves up, keeping the rise', () => {
    const state = modalPointer(modalKey(begin('grab'), 'z'), { x: 600, y: 390 }); // 10 px up = 0.5 m
    expect(modalPatch(state)).toMatchObject({ eavesHeight: 2.6, ridgeHeight: 4 });
  });

  it('adds a typed delta in metres', () => {
    expect(modalPatch(keys(begin('grab'), 'z', '0', '.', '5'))).toMatchObject({ eavesHeight: 2.6, ridgeHeight: 4 });
    expect(modalPatch(keys(begin('grab'), 'y', '-', '5'))).toMatchObject({ length: 9 });
    expect(modalPatch(keys(begin('grab'), 'y', '5', '-'))).toMatchObject({ length: 9 }); // minus flips the sign
  });

  it('stops at the limits and never lets the roof fall below the minimum rise', () => {
    expect(modalPatch(keys(begin('grab'), 'z', '9', '9'))).toMatchObject({ eavesHeight: 3.5, ridgeHeight: 4.9 });
    expect(modalPatch(keys(begin('grab'), 'z', '-', '9'))).toMatchObject({ eavesHeight: 1.5, ridgeHeight: 2.9 });
    const tall = { ...config, eavesHeight: 3, ridgeHeight: 5.8 };
    expect(liftPatch(tall, 3.5)).toEqual({ eavesHeight: 3.5, ridgeHeight: 6 }); // the rise gives way at the ridge limit
  });

  it('switches between grab and scale', () => {
    const state = keys(begin('grab'), 'x', '3', 's');
    expect(state.kind).toBe('scale');
    expect(state.axis).toBe('x');
    expect(state.typed).toBe('');
  });
});

describe('ending a modal', () => {
  it('confirms with Enter or a left click and keeps the result', () => {
    const typed = keys(begin('scale'), '2');
    for (const done of [modalKey(typed, 'Enter'), modalClick(typed, 0)]) {
      expect(done.status).toBe('confirmed');
      expect(modalPatch(done)).toMatchObject({ length: 28, width: 14 });
      expect(modalChanged(done)).toBe(true);
      expect(modalKey(done, '5')).toBe(done); // finished modals ignore input
    }
  });

  it('cancels with Esc or a right click and restores the exact start', () => {
    const odd = { ...config, length: 31.5, width: 9.25, eavesHeight: 2.2, ridgeHeight: 3.3 };
    const moved = keys(modalPointer(begin('scale', odd), at(900)), 'z', '3');
    for (const done of [modalKey(moved, 'Escape'), modalClick(moved, 2)]) {
      expect(done.status).toBe('cancelled');
      expect(modalPatch(done)).toEqual({ length: 31.5, width: 9.25, eavesHeight: 2.2, ridgeHeight: 3.3 });
      expect(modalChanged(done)).toBe(false);
    }
  });

  it('ignores keys it does not know', () => {
    const state = begin('scale');
    expect(modalKey(state, 'q')).toBe(state);
    expect(modalKey(state, 'Backspace')).toBe(state);
    expect(modalKey(keys(state, '1', '.'), '.').typed).toBe('1.');
  });
});

describe('readout', () => {
  it('describes a constrained scale', () => {
    const label = modalLabel(keys(begin('scale'), 'x', '1', '.', '2', '5'));
    expect(label.amount).toBe('1.25');
    expect(formatModalLabel(label, t)).toBe('Scale X 1.25 → Width 9 m (+2)');
  });

  it('describes a free scale from the pointer', () => {
    expect(formatModalLabel(modalLabel(modalPointer(begin('scale'), at(650))), t)).toBe(
      'Scale 1.5 → Width 10.5 m (+3.5) · Length 21 m (+7)'
    );
  });

  it('describes a height grab and the axis hint', () => {
    expect(formatModalLabel(modalLabel(keys(begin('grab'), 'z', '0', '.', '5')), t)).toBe(
      'Grab Z 0.5 → Eaves 2.6 m (+0.5) · Ridge 4 m (+0.5)'
    );
    expect(formatModalLabel(modalLabel(begin('grab')), t)).toBe('Grab · press X, Y or Z');
  });
});

describe('viewport keys', () => {
  it('starts grab and scale only while a resizable part is being edited', () => {
    expect(resolveViewportKey({ key: 'g' }, { canTransform: true })).toEqual({ type: 'modal', kind: 'grab' });
    expect(resolveViewportKey({ key: 'S' }, { canTransform: true })).toEqual({ type: 'modal', kind: 'scale' });
    expect(resolveViewportKey({ key: 'g' })).toBeNull();
    expect(resolveViewportKey({ key: 's' }, { canTransform: false })).toBeNull();
    expect(resolveViewportKey({ key: 'S', shiftKey: true }, { canTransform: true })).toBeNull();
    expect(resolveViewportKey({ key: 's', ctrlKey: true }, { canTransform: true })).toBeNull();
  });
});
