import { describe, expect, it } from 'vitest';
import {
  MAX_POLAR,
  axisView,
  easeInOutCubic,
  frameDistance,
  frameView,
  fromSpherical,
  houseBox,
  interpolateView,
  length3,
  oppositeView,
  orbitView,
  presetView,
  projectAxes,
  shortestAngle,
  toSpherical,
  transitionDuration,
  zoomView,
  type HouseShape,
  type Vec3,
  type View,
} from '@/lib/viewMath';
import { antechamber } from '@/components/farm/scene/structureLayout';
import { DEFAULT_CONFIG, DIMENSION_LIMITS, type DoorEntry } from '@/components/farm/scene/legacyConfig';
import { ORBIT_STEP, isTypingTarget, resolveViewportKey } from '@/lib/viewportKeys';

const close = (a: Vec3, b: Vec3, digits = 5) => a.forEach((value, i) => expect(value).toBeCloseTo(b[i], digits));
const distance = (view: View) =>
  length3([view.position[0] - view.target[0], view.position[1] - view.target[1], view.position[2] - view.target[2]]);

const front: View = { position: [0, 10, 40], target: [0, 2, 0] };
const back: View = { position: [0, 10, -40], target: [0, 2, 0] };

describe('view transitions', () => {
  it('starts and ends exactly at the two views', () => {
    const side: View = { position: [30, 8, 0], target: [1, 3, 0] };
    close(interpolateView(front, side, 0).position, front.position);
    close(interpolateView(front, side, 1).position, side.position);
    close(interpolateView(front, side, 1).target, side.target);
  });

  it('swings around the target instead of cutting through the model', () => {
    const halfway = interpolateView(front, back, 0.5);
    expect(distance(halfway)).toBeCloseTo(distance(front), 5);
    expect(Math.abs(halfway.position[0])).toBeGreaterThan(30);
  });

  it('takes the shortest way round', () => {
    expect(shortestAngle(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2, 6);
    expect(shortestAngle(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('round-trips spherical coordinates', () => {
    const offset: Vec3 = [3, 4, -12];
    close(fromSpherical(toSpherical(offset)), offset);
  });

  it('eases in and out and is instant for reduced motion', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(transitionDuration(front, back, true)).toBe(0);
    const big = transitionDuration(front, back, false);
    const small = transitionDuration(front, orbitView(front, 0.1, 0), false);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(1.1);
  });
});

describe('framing and orbiting', () => {
  it('backs off far enough to fit a box, and further on a narrow screen', () => {
    const wide = frameDistance(5, 45, 16 / 9);
    const narrow = frameDistance(5, 45, 9 / 19);
    expect(wide).toBeGreaterThan(5);
    expect(narrow).toBeGreaterThan(wide);
  });

  it('centres on the box and keeps the viewing direction', () => {
    const view = frameView(front, { min: [-1, 0, 14], max: [1, 3, 16] }, 45, 1.6);
    close(view.target, [0, 1.5, 15]);
    expect(view.position[2]).toBeGreaterThan(15);
    expect(Math.abs(view.position[0])).toBeLessThan(1e-6);
  });

  it('orbits in steps, never under the ground', () => {
    const turned = orbitView(front, ORBIT_STEP * 6, 0);
    expect(turned.position[0]).toBeCloseTo(distance(front) * Math.sin(toSpherical([0, 8, 40]).polar), 4);
    const lowered = orbitView(front, 0, 10);
    expect(toSpherical([lowered.position[0], lowered.position[1] - 2, lowered.position[2]]).polar).toBeCloseTo(MAX_POLAR, 6);
  });

  it('flips to the opposite side and looks down an axis', () => {
    close(oppositeView(front).position, [0, 10, -40], 4);
    const top = axisView(front, [0, 1, 0]);
    expect(top.position[1]).toBeGreaterThan(30);
    expect(distance(top)).toBeCloseTo(distance(front), 5);
  });

  it('zooms within limits', () => {
    expect(distance(zoomView(front, 0.5))).toBeCloseTo(distance(front) / 2, 5);
    expect(distance(zoomView(front, 0.0001))).toBeCloseTo(2, 5);
  });

  it('stops a zoom from outside at the cover instead of passing into the house', () => {
    const box = houseBox({ ...DEFAULT_CONFIG, length: 30, width: 10, ridgeHeight: 6 });
    // Looking across the house at a point outside the far side wall.
    const across: View = { position: [30, 3, 0], target: [-8, 3, 0] };
    const zoomed = zoomView(across, 0.1, { minDistance: 2, maxDistance: 200 }, box);
    expect(zoomed.position[0]).toBeGreaterThan(5);
    expect(zoomed.position[0]).toBeLessThan(30);
    // A target inside the house can still be zoomed into.
    const centre: View = { position: [30, 3, 0], target: [0, 3, 0] };
    expect(zoomView(centre, 0.1, { minDistance: 2, maxDistance: 200 }, box).position[0]).toBeCloseTo(3, 5);
  });

  it('projects the world axes for the orientation gizmo', () => {
    // Identity view: the camera looks down -Z with Y up.
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const axes = projectAxes(identity);
    const x = axes.find((a) => a.axis === 'x')!;
    expect([x.x, x.y]).toEqual([1, 0]);
    expect(axes[axes.length - 1].axis).toBe('z'); // nearest drawn last
  });
});

describe('keyboard map', () => {
  it('keeps the top-row digit views', () => {
    expect(resolveViewportKey({ key: '1', code: 'Digit1' })).toEqual({ type: 'view', view: 'auto' });
    expect(resolveViewportKey({ key: '6', code: 'Digit6' })).toEqual({ type: 'view', view: 'focus-door' });
  });

  it('follows Blender on the numeric keypad', () => {
    expect(resolveViewportKey({ key: '1', code: 'Numpad1' })).toEqual({ type: 'view', view: 'front' });
    expect(resolveViewportKey({ key: '7', code: 'Numpad7' })).toEqual({ type: 'view', view: 'top' });
    expect(resolveViewportKey({ key: '1', code: 'Numpad1', ctrlKey: true })).toEqual({ type: 'view', view: 'back' });
    expect(resolveViewportKey({ key: '4', code: 'Numpad4' })).toEqual({ type: 'orbit', azimuth: -1, polar: 0 });
    expect(resolveViewportKey({ key: '.', code: 'NumpadDecimal' })).toEqual({ type: 'frame' });
  });

  it('takes undo and redo but leaves other browser shortcuts alone', () => {
    expect(resolveViewportKey({ key: 'z', ctrlKey: true })).toEqual({ type: 'undo' });
    expect(resolveViewportKey({ key: 'Z', ctrlKey: true, shiftKey: true })).toEqual({ type: 'redo' });
    expect(resolveViewportKey({ key: 'y', metaKey: true })).toEqual({ type: 'redo' });
    expect(resolveViewportKey({ key: 'r', ctrlKey: true })).toBeNull();
    expect(resolveViewportKey({ key: '1', code: 'Digit1', ctrlKey: true })).toBeNull();
    expect(resolveViewportKey({ key: 'f', altKey: true })).toBeNull();
  });

  it('maps the editing keys', () => {
    expect(resolveViewportKey({ key: 'f' })).toEqual({ type: 'frame' });
    expect(resolveViewportKey({ key: 'Tab' })).toEqual({ type: 'toggle-mode' });
    expect(resolveViewportKey({ key: 'Tab', shiftKey: true })).toBeNull();
    expect(resolveViewportKey({ key: '?', shiftKey: true })).toEqual({ type: 'help' });
    expect(resolveViewportKey({ key: ']' })).toEqual({ type: 'cycle', direction: 1 });
    expect(resolveViewportKey({ key: 'q' })).toBeNull();
  });

  it('knows when the user is typing', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('named views', () => {
  const house = (patch: Partial<HouseShape> = {}): HouseShape => ({ ...DEFAULT_CONFIG, greenhouseType: 'naturally-ventilated', ...patch });
  const within = (point: Vec3, h: HouseShape) =>
    Math.abs(point[0]) < h.width / 2 && Math.abs(point[2]) < h.length / 2 && point[1] > 0 && point[1] < h.gutterHeight;
  const sizes: Array<Partial<HouseShape>> = [];
  for (const width of [DIMENSION_LIMITS.width.min, 10, 24, 100]) {
    for (const length of [DIMENSION_LIMITS.length.min, 30, 200]) {
      for (const gutterHeight of [DIMENSION_LIMITS.gutterHeight.min, 4, DIMENSION_LIMITS.gutterHeight.max]) {
        sizes.push({ width, length, gutterHeight, ridgeHeight: gutterHeight + 2 });
      }
    }
  }

  it('keeps every view within the orbit distance limits', () => {
    const presets = ['auto', 'front', 'side', 'top', 'inside', 'focus-door', 'focus-vents', 'focus-irrigation', 'focus-climate'] as const;
    for (const size of sizes) {
      for (const preset of presets) {
        const h = house(size);
        const view = presetView(preset, h);
        // The orbit's limits, as the 3D view sets them (MiddlePanel's sceneReach).
        const maxDistance = Math.max(200, Math.max(50, Math.ceil(Math.max(h.length, h.width) / 50) * 50) * 2.5);
        expect(distance(view)).toBeGreaterThanOrEqual(2);
        expect(distance(view)).toBeLessThanOrEqual(maxDistance);
      }
    }
  });

  it('puts the inside view inside the house, under the gutter, for any size', () => {
    for (const size of sizes) {
      const h = house(size);
      const view = presetView('inside', h);
      expect(within(view.position, h)).toBe(true);
      expect(within(view.target, h)).toBe(true);
    }
    const wide = house({ width: 24, length: 30 });
    expect(within(presetView('inside', wide).position, wide)).toBe(true);
  });

  it('stands outside in front of the entry at eye height for the door view', () => {
    const doors: DoorEntry[] = ['single-sliding', 'double-sliding', 'roll-up', 'curtain'];
    for (const size of sizes) {
      for (const doorEntry of doors) {
        const h = house({ ...size, doorEntry });
        const room = antechamber(h.greenhouseType, doorEntry, h.gutterHeight);
        const front = h.length / 2 + (room?.depth ?? 0);
        const { position, target } = presetView('focus-door', h);
        // In front of the antechamber, below its roof, far enough back to see all of it.
        expect(position[2]).toBeGreaterThan(front + 5);
        expect(position[1]).toBeLessThan(room?.height ?? 2.2);
        expect(position[1]).toBeGreaterThan(1.2);
        expect(Math.abs(target[0])).toBeLessThan(0.5);
        expect(target[2]).toBeGreaterThanOrEqual(h.length / 2);
        expect(target[2]).toBeLessThanOrEqual(front);
      }
    }
  });

  it('looks at the side wall from outside, at an angle, for the vents', () => {
    for (const size of sizes) {
      const h = house(size);
      const { position, target } = presetView('focus-vents', h);
      expect(position[0]).toBeGreaterThan(h.width / 2 + 3);
      expect(Math.abs(target[0] - h.width / 2)).toBeLessThan(0.5);
      // Not square on: the view runs along the wall too.
      expect(Math.abs(position[2] - target[2])).toBeGreaterThan(2);
    }
  });

  it('sees the pad wall from outside the back end for the climate view', () => {
    for (const size of sizes) {
      const h = house({ ...size, greenhouseType: 'climate-controlled' });
      const { position, target } = presetView('focus-climate', h);
      expect(position[2]).toBeLessThan(-h.length / 2 - 3);
      expect(target[2]).toBeLessThanOrEqual(-h.length / 2);
      expect(Math.abs(target[0])).toBeLessThan(h.width / 2);
    }
  });
});
