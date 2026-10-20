import { DIMENSION_LIMITS, type FarmConfig } from '@/components/farm/scene/legacyConfig';
import { MIN_RISE, SNAP_STEP, dragReadout, handlesForPart, resizePatch, type EditablePart, type ResizeKey } from '@/lib/sceneEdit';

/**
 * Blender-style modal grab (G) and scale (S) for the selected part, as a pure state machine. The
 * view starts one with startModal, feeds it keys and pointer moves, and applies modalPatch after
 * each step; Enter or a left click confirms, Esc or a right click puts the starting sizes back.
 *
 * Axes follow the house, not the world: X is the width (across the spans), Y the length (the long
 * axis, Blender's Y) and Z the height (gutter, with the ridge keeping its rise).
 */

export type ModalKind = 'grab' | 'scale';
export type ModalAxis = 'x' | 'y' | 'z';
export type ModalStatus = 'active' | 'confirmed' | 'cancelled';

/** A point on screen, in pixels (y grows downward, as in pointer events). */
export interface ScreenPoint {
  x: number;
  y: number;
}

export type ModalDimensions = Pick<FarmConfig, 'length' | 'width' | 'gutterHeight' | 'ridgeHeight'>;

export interface ModalState {
  kind: ModalKind;
  part: EditablePart;
  /** The config when the modal began; cancelling returns exactly these sizes. */
  start: FarmConfig;
  axis: ModalAxis | null;
  /** Axes the part's grips allow (roof: only Z). */
  axes: ModalAxis[];
  pointerStart: ScreenPoint;
  pointer: ScreenPoint;
  /** The house centre projected to the screen. */
  centre: ScreenPoint;
  /** How many metres one pixel of pointer travel is worth for grab. */
  metresPerPixel: number;
  /** Digits typed so far ('' when the pointer drives the value). */
  typed: string;
  status: ModalStatus;
}

/** The dimension each axis drives. */
export const AXIS_DIMENSION: Record<ModalAxis, ResizeKey> = { x: 'width', y: 'length', z: 'gutterHeight' };

/** Pointer travel for grab when the view gives no better figure. */
export const DEFAULT_METRES_PER_PIXEL = 0.05;
/** Scale needs a sensible lever: a start this close to the centre would make the factor jump. */
const MIN_LEVER = 10;

const DIMENSION_KEYS: ResizeKey[] = ['length', 'width', 'gutterHeight', 'ridgeHeight'];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number) => Number(value.toFixed(2));
const dimensionsOf = (config: FarmConfig): ModalDimensions => ({
  length: config.length,
  width: config.width,
  gutterHeight: config.gutterHeight,
  ridgeHeight: config.ridgeHeight,
});

/** The axes a part's grips allow; empty for parts chosen from a list. */
export function modalAxes(part: EditablePart | null, config: Pick<FarmConfig, 'roofType'>): ModalAxis[] {
  const handles = handlesForPart(part, config);
  return (['x', 'y', 'z'] as const).filter((axis) => handles.includes(AXIS_DIMENSION[axis]));
}

/** Begins a grab or scale, or returns null when the part has no sizes to change. */
export function startModal(
  kind: ModalKind,
  part: EditablePart | null,
  config: FarmConfig,
  pointer: ScreenPoint,
  centre: ScreenPoint,
  metresPerPixel = DEFAULT_METRES_PER_PIXEL
): ModalState | null {
  const axes = modalAxes(part, config);
  if (!part || axes.length === 0) return null;
  return {
    kind,
    part,
    start: config,
    // A part with a single axis (the roof) is constrained to it from the start.
    axis: axes.length === 1 ? axes[0] : null,
    axes,
    pointerStart: pointer,
    pointer,
    centre,
    metresPerPixel: metresPerPixel > 0 ? metresPerPixel : DEFAULT_METRES_PER_PIXEL,
    typed: '',
    status: 'active',
  };
}

/** True while grab still needs an axis before it can change anything. */
export function needsAxis(state: ModalState): boolean {
  return state.kind === 'grab' && state.axis === null;
}

/**
 * Applies a key press. Returns the same state object when the key means nothing to the modal, so
 * the caller can tell whether it was used.
 */
export function modalKey(state: ModalState, key: string): ModalState {
  if (state.status !== 'active') return state;
  const lower = key.length === 1 ? key.toLowerCase() : key;

  if (key === 'Enter') return { ...state, status: 'confirmed' };
  if (key === 'Escape') return { ...state, status: 'cancelled' };

  if (lower === 'x' || lower === 'y' || lower === 'z') {
    if (!state.axes.includes(lower)) return state;
    // The same axis again frees it, unless it is the only one the part has.
    if (state.axis === lower) return state.axes.length > 1 ? { ...state, axis: null } : state;
    return { ...state, axis: lower };
  }

  if (lower === 'g' || lower === 's') {
    const kind: ModalKind = lower === 'g' ? 'grab' : 'scale';
    return kind === state.kind ? state : { ...state, kind, typed: '' };
  }

  if (/^[0-9]$/.test(key)) return { ...state, typed: state.typed + key };
  if (key === '.' || key === ',') {
    return state.typed.includes('.') ? state : { ...state, typed: state.typed + '.' };
  }
  if (key === '-') {
    // As in Blender, minus flips the sign of what is typed.
    return { ...state, typed: state.typed.startsWith('-') ? state.typed.slice(1) : `-${state.typed}` };
  }
  if (key === 'Backspace') return state.typed ? { ...state, typed: state.typed.slice(0, -1) } : state;
  return state;
}

/** Moves the pointer. Typed numbers win over the pointer until they are erased. */
export function modalPointer(state: ModalState, pointer: ScreenPoint): ModalState {
  if (state.status !== 'active') return state;
  return { ...state, pointer };
}

/** A click ends the modal: the left button confirms, any other cancels. */
export function modalClick(state: ModalState, button: number): ModalState {
  if (state.status !== 'active') return state;
  return { ...state, status: button === 0 ? 'confirmed' : 'cancelled' };
}

/** The typed number, or null when nothing usable is typed yet ('', '-', '.'). */
function typedNumber(state: ModalState): number | null {
  const value = Number.parseFloat(state.typed);
  return Number.isFinite(value) ? value : null;
}

/** The scale factor: typed, or pointer distance from the centre over the starting distance. */
export function modalFactor(state: ModalState): number {
  const typed = typedNumber(state);
  if (typed !== null) return typed;
  const lever = (point: ScreenPoint) => Math.hypot(point.x - state.centre.x, point.y - state.centre.y);
  return lever(state.pointer) / Math.max(lever(state.pointerStart), MIN_LEVER);
}

/**
 * The grab amount in metres added to the dimension. Typed values are used as they are; pointer
 * travel moves a wall, and the house is centred, so the width or length changes by twice that.
 */
export function modalDelta(state: ModalState): number {
  const typed = typedNumber(state);
  if (typed !== null) return typed;
  if (state.axis === null) return 0;
  const { pointer, pointerStart, centre, metresPerPixel } = state;
  if (state.axis === 'z') return (pointerStart.y - pointer.y) * metresPerPixel;
  const lever = (point: ScreenPoint) => Math.hypot(point.x - centre.x, point.y - centre.y);
  return 2 * (lever(pointer) - lever(pointerStart)) * metresPerPixel;
}

/**
 * Raises or lowers the house to a gutter height, keeping the roof's rise. The rise only shrinks
 * (never below MIN_RISE) when the ridge would pass its limit; a flat roof keeps ridge = gutter.
 */
export function liftPatch(config: FarmConfig, rawGutter: number): Partial<ModalDimensions> {
  if (!Number.isFinite(rawGutter)) return {};
  if (config.roofType === 'flat') return resizePatch(config, 'gutterHeight', rawGutter);
  const gutterLimits = DIMENSION_LIMITS.gutterHeight;
  const ridgeLimits = DIMENSION_LIMITS.ridgeHeight;
  const rise = Math.max(config.ridgeHeight - config.gutterHeight, MIN_RISE);
  let gutterHeight = clamp(Math.round(rawGutter / SNAP_STEP.gutterHeight) * SNAP_STEP.gutterHeight, gutterLimits.min, gutterLimits.max);
  const ridgeHeight = clamp(gutterHeight + rise, ridgeLimits.min, ridgeLimits.max);
  gutterHeight = Math.min(gutterHeight, ridgeHeight - MIN_RISE);
  return { gutterHeight: round(gutterHeight), ridgeHeight: round(ridgeHeight) };
}

/** The sizes for one dimension at a raw value, through the same snapping and limits as a drag. */
function dimensionPatch(config: FarmConfig, key: ResizeKey, raw: number): Partial<ModalDimensions> {
  return key === 'gutterHeight' ? liftPatch(config, raw) : resizePatch(config, key, raw);
}

/**
 * The four sizes the house should have now. It is absolute (relative to the start), so applying it
 * after every step is safe; once cancelled it is exactly the starting sizes.
 */
export function modalPatch(state: ModalState): ModalDimensions {
  const { start } = state;
  const base = dimensionsOf(start);
  if (state.status === 'cancelled') return base;

  if (state.kind === 'scale') {
    const factor = modalFactor(state);
    if (state.axis === null) {
      return {
        ...base,
        ...resizePatch(start, 'width', start.width * factor),
        ...resizePatch(start, 'length', start.length * factor),
      };
    }
    const key = AXIS_DIMENSION[state.axis];
    return { ...base, ...dimensionPatch(start, key, start[key] * factor) };
  }

  if (state.axis === null) return base; // grab waits for an axis
  const key = AXIS_DIMENSION[state.axis];
  return { ...base, ...dimensionPatch(start, key, start[key] + modalDelta(state)) };
}

/** The sizes worth showing for the current axis. */
function shownDimensions(state: ModalState): ResizeKey[] {
  if (state.axis === 'z') return state.start.roofType === 'flat' ? ['gutterHeight'] : ['gutterHeight', 'ridgeHeight'];
  if (state.axis) return [AXIS_DIMENSION[state.axis]];
  return state.kind === 'scale' ? ['width', 'length'] : [];
}

/** i18n keys for the readout. */
export const MODAL_LABEL_KEYS = {
  grab: 'viewport.modal.grab',
  scale: 'viewport.modal.scale',
  pickAxis: 'viewport.modal.pickAxis',
  axis: { x: 'viewport.modal.axis.x', y: 'viewport.modal.axis.y', z: 'viewport.modal.axis.z' },
  dimension: {
    length: 'viewport.modal.length',
    width: 'viewport.modal.width',
    gutterHeight: 'viewport.modal.gutter',
    ridgeHeight: 'viewport.modal.ridge',
  },
} as const;

export interface ModalLabel {
  kindKey: string;
  axisKey: string | null;
  /** What is typed, or the live factor ("1.25") or delta ("+0.5"). */
  amount: string;
  /** Shown instead of sizes while grab waits for an axis. */
  hintKey: string | null;
  dimensions: Array<{ key: ResizeKey; labelKey: string; value: number; start: number }>;
}

/** The readout parts for the header: "Scale X 1.25 → Width 13 m (+3)". */
export function modalLabel(state: ModalState): ModalLabel {
  const patch = modalPatch(state);
  let amount = state.typed;
  if (!amount) {
    if (state.kind === 'scale') amount = String(round(modalFactor(state)));
    else {
      const delta = round(modalDelta(state));
      amount = delta > 0 ? `+${delta}` : String(delta);
    }
  }
  return {
    kindKey: MODAL_LABEL_KEYS[state.kind],
    axisKey: state.axis ? MODAL_LABEL_KEYS.axis[state.axis] : null,
    amount,
    hintKey: needsAxis(state) ? MODAL_LABEL_KEYS.pickAxis : null,
    dimensions: shownDimensions(state).map((key) => ({
      key,
      labelKey: MODAL_LABEL_KEYS.dimension[key],
      value: patch[key],
      start: state.start[key],
    })),
  };
}

/** Joins the readout into one line with the caller's translator. */
export function formatModalLabel(label: ModalLabel, t: (key: string) => string): string {
  const head = [t(label.kindKey), label.axisKey ? t(label.axisKey) : '', label.hintKey ? '' : label.amount]
    .filter(Boolean)
    .join(' ');
  if (label.hintKey) return `${head} · ${t(label.hintKey)}`;
  if (label.dimensions.length === 0) return head;
  const sizes = label.dimensions.map((dimension) => dragReadout(t(dimension.labelKey), dimension.value, dimension.start));
  return `${head} → ${sizes.join(' · ')}`;
}

/** True when the patch differs from the start, so confirming is worth an undo step. */
export function modalChanged(state: ModalState): boolean {
  const patch = modalPatch(state);
  return DIMENSION_KEYS.some((key) => patch[key] !== state.start[key]);
}
