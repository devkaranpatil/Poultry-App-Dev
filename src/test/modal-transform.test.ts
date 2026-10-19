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
import { resolveViewportKey } from '@/lib/viewportKeys';

// 30 x 10 m, gutter 4, ridge 6 (gable).
const config: FarmConfig = { ...DEFAULT_CONFIG };
const flat: FarmConfig = { ...DEFAULT_CONFIG, roofType: 'flat', ridgeHeight: 4 };
const centre: ScreenPoint = { x: 500, y: 400 };
const at = (x: number, y = 400): ScreenPoint => ({ x, y });

const begin = (kind: 'grab' | 'scale', base = config, part: 'size' | 'roof' | 'cover' = 'size') => {
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
  'viewport.modal.gutter': 'Gutter',
  'viewport.modal.ridge': 'Ridge',
};
const t = (key: string) => english[key] ?? key;

describe('starting a modal', () => {
  it('only starts for parts with grips', () => {
    expect(startModal('scale', 'door', config, at(600), centre)).toBeNull();
    expect(startModal('grab', 'crop', config, at(600), centre)).toBeNull();
    expect(startModal('grab', null, config, at(600), centre)).toBeNull();
    expect(begin('scale').status).toBe('active');
  });

  it('offers the axes the grips allow', () => {
    expect(modalAxes('size', config)).toEqual(['x', 'y', 'z']);
    expect(modalAxes('cover', config)).toEqual(['x', 'y', 'z']);
    expect(modalAxes('roof', config)).toEqual(['z']);
    expect(modalAxes('vents', config)).toEqual([]);
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
    expect(modalPatch(state)).toEqual({ length: 45, width: 15, gutterHeight: 4, ridgeHeight: 6 });
  });

  it('works in any direction from the centre', () => {
    const state = modalPointer(begin('scale'), { x: 500, y: 200 }); // 200 px straight up: 2x
    expect(modalPatch(state)).toMatchObject({ length: 60, width: 20 });
  });

  it('constrains to one axis, and the same axis again frees it', () => {
    let state = modalPointer(begin('scale'), at(700)); // 2x
    state = modalKey(state, 'x');
    expect(state.axis).toBe('x');
    expect(modalPatch(state)).toEqual({ length: 30, width: 20, gutterHeight: 4, ridgeHeight: 6 });
    state = modalKey(state, 'Y');
    expect(modalPatch(state)).toMatchObject({ length: 60, width: 10 });
    state = modalKey(state, 'y');
    expect(state.axis).toBeNull();
    expect(modalPatch(state)).toMatchObject({ length: 60, width: 20 });
  });

  it('scales the height and keeps the rise', () => {
    const state = keys(begin('scale'), 'z', '1', '.', '5');
    expect(modalPatch(state)).toEqual({ length: 30, width: 10, gutterHeight: 6, ridgeHeight: 8 });
  });

  it('takes a typed factor over the pointer', () => {
    let state = modalPointer(begin('scale'), at(900));
    state = keys(state, '1', '.', '5');
    expect(state.typed).toBe('1.5');
    expect(modalPatch(state)).toMatchObject({ length: 45, width: 15 });
    state = keys(state, 'Backspace', 'Backspace', 'Backspace');
    expect(state.typed).toBe('');
    expect(modalPatch(state)).toMatchObject({ length: 120, width: 40 }); // back to the pointer (4x)
  });

  it('snaps and clamps like a drag', () => {
    expect(modalPatch(keys(begin('scale'), 'x', '1', '.', '2', '6'))).toMatchObject({ width: 13 }); // 12.6 → 13
    expect(modalPatch(keys(begin('scale'), '1', '0'))).toMatchObject({ length: 200, width: 100 });
    expect(modalPatch(keys(begin('scale'), '0', '.', '1'))).toMatchObject({ length: 5, width: 5 });
    expect(modalPatch(keys(begin('scale'), '-', '2'))).toMatchObject({ length: 5, width: 5 });
  });

  it('keeps a flat roof level', () => {
    const state = keys(begin('scale', flat), 'z', '1', '.', '5');
    expect(modalPatch(state)).toMatchObject({ gutterHeight: 6, ridgeHeight: 6 });
  });
});

describe('grab', () => {
  it('waits for an axis', () => {
    const state = modalPointer(begin('grab'), at(800));
    expect(needsAxis(state)).toBe(true);
    expect(modalPatch(state)).toEqual({ length: 30, width: 10, gutterHeight: 4, ridgeHeight: 6 });
    expect(modalLabel(state).hintKey).toBe('viewport.modal.pickAxis');
  });

  it('moves the wall with the pointer, so the width grows twice as much', () => {
    // 40 px further out at 0.05 m/px is 2 m per wall, 4 m in all.
    const state = modalPointer(modalKey(begin('grab'), 'x'), at(640));
    expect(modalPatch(state)).toMatchObject({ width: 14, length: 30 });
  });

  it('raises the gutter as the pointer moves up, keeping the rise', () => {
    const state = modalPointer(modalKey(begin('grab'), 'z'), { x: 600, y: 360 }); // 40 px up = 2 m
    expect(modalPatch(state)).toMatchObject({ gutterHeight: 6, ridgeHeight: 8 });
  });

  it('adds a typed delta in metres', () => {
    expect(modalPatch(keys(begin('grab'), 'z', '0', '.', '5'))).toMatchObject({ gutterHeight: 4.5, ridgeHeight: 6.5 });
    expect(modalPatch(keys(begin('grab'), 'y', '-', '5'))).toMatchObject({ length: 25 });
    expect(modalPatch(keys(begin('grab'), 'y', '5', '-'))).toMatchObject({ length: 25 }); // minus flips the sign
  });

  it('stops at the limits and never lets the roof fall below the minimum rise', () => {
    expect(modalPatch(keys(begin('grab'), 'z', '9', '9'))).toMatchObject({ gutterHeight: 8, ridgeHeight: 10 });
    expect(modalPatch(keys(begin('grab'), 'z', '-', '9'))).toMatchObject({ gutterHeight: 2, ridgeHeight: 4 });
    const tall = { ...config, gutterHeight: 6, ridgeHeight: 11 };
    expect(liftPatch(tall, 8)).toEqual({ gutterHeight: 8, ridgeHeight: 12 }); // the rise gives way at the ridge limit;
  });

  it('moves both heights together on a flat roof', () => {
    expect(modalPatch(keys(begin('grab', flat), 'z', '1'))).toMatchObject({ gutterHeight: 5, ridgeHeight: 5 });
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
      expect(modalPatch(done)).toMatchObject({ length: 60, width: 20 });
      expect(modalChanged(done)).toBe(true);
      expect(modalKey(done, '5')).toBe(done); // finished modals ignore input
    }
  });

  it('cancels with Esc or a right click and restores the exact start', () => {
    const odd = { ...config, length: 31.5, width: 9.25, gutterHeight: 4.2, ridgeHeight: 6.3 };
    const moved = keys(modalPointer(begin('scale', odd), at(900)), 'z', '3');
    for (const done of [modalKey(moved, 'Escape'), modalClick(moved, 2)]) {
      expect(done.status).toBe('cancelled');
      expect(modalPatch(done)).toEqual({ length: 31.5, width: 9.25, gutterHeight: 4.2, ridgeHeight: 6.3 });
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
    expect(formatModalLabel(label, t)).toBe('Scale X 1.25 → Width 13 m (+3)');
  });

  it('describes a free scale from the pointer', () => {
    expect(formatModalLabel(modalLabel(modalPointer(begin('scale'), at(650))), t)).toBe(
      'Scale 1.5 → Width 15 m (+5) · Length 45 m (+15)'
    );
  });

  it('describes a height grab and the axis hint', () => {
    expect(formatModalLabel(modalLabel(keys(begin('grab'), 'z', '0', '.', '5')), t)).toBe(
      'Grab Z 0.5 → Gutter 4.5 m (+0.5) · Ridge 6.5 m (+0.5)'
    );
    expect(formatModalLabel(modalLabel(begin('grab')), t)).toBe('Grab · press X, Y or Z');
    expect(modalLabel(keys(begin('grab', flat), 'z')).dimensions.map((d) => d.key)).toEqual(['gutterHeight']);
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
