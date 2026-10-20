/**
 * The 3D view's keyboard map, Blender-flavoured. The top-row digits keep the app's original view
 * shortcuts; the numeric keypad follows Blender (1 front, 3 side, 7 top, Ctrl for the opposite side,
 * 2/4/6/8 orbit, 5 inside, 0 overview, . frame selected).
 */

export type ViewName =
  | 'auto'
  | 'front'
  | 'back'
  | 'side'
  | 'other-side'
  | 'top'
  | 'inside'
  | 'focus-entry'
  | 'focus-walls'
  | 'focus-feeding'
  | 'focus-fans';

export type ViewportAction =
  | { type: 'view'; view: ViewName }
  | { type: 'orbit'; azimuth: -1 | 0 | 1; polar: -1 | 0 | 1 }
  | { type: 'opposite' }
  | { type: 'zoom'; direction: 1 | -1 }
  | { type: 'reset' }
  | { type: 'frame' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'toggle-mode' }
  | { type: 'help' }
  | { type: 'escape' }
  | { type: 'cycle'; direction: 1 | -1 }
  | { type: 'modal'; kind: 'grab' | 'scale' };

export interface KeyInput {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** What the view is doing, for keys that only mean something while editing. */
export interface ViewportKeyContext {
  /** Edit mode is on and the selected part has sizes to change (handlesForPart is not empty). */
  canTransform?: boolean;
}

const DIGIT_VIEWS: Record<string, ViewName> = {
  '1': 'auto',
  '2': 'front',
  '3': 'side',
  '4': 'top',
  '5': 'inside',
  '6': 'focus-entry',
  '7': 'focus-walls',
  '8': 'focus-feeding',
  '9': 'focus-fans',
};

/** Orbit step for numpad 2/4/6/8, as in Blender (15 degrees). */
export const ORBIT_STEP = Math.PI / 12;

/**
 * The action a key press asks for, or null to leave the key to the page. G and S start a modal grab
 * or scale (see modalTransform) only when the context allows it; otherwise the page keeps them.
 */
export function resolveViewportKey(input: KeyInput, context: ViewportKeyContext = {}): ViewportAction | null {
  const { key, code = '', shiftKey = false, altKey = false } = input;
  const mod = Boolean(input.ctrlKey || input.metaKey);

  // Undo and redo are the only Ctrl shortcuts the view takes; the browser keeps the rest.
  if (mod && !altKey) {
    const lower = key.toLowerCase();
    if (lower === 'z') return shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (lower === 'y' && !shiftKey) return { type: 'redo' };
    if (code === 'Numpad1') return { type: 'view', view: 'back' };
    if (code === 'Numpad3') return { type: 'view', view: 'other-side' };
    return null;
  }
  if (altKey) return null;

  if (code.startsWith('Numpad')) {
    switch (code) {
      case 'Numpad1':
        return { type: 'view', view: 'front' };
      case 'Numpad3':
        return { type: 'view', view: 'side' };
      case 'Numpad7':
        return { type: 'view', view: 'top' };
      case 'Numpad5':
        return { type: 'view', view: 'inside' };
      case 'Numpad0':
        return { type: 'view', view: 'auto' };
      case 'Numpad9':
        return { type: 'opposite' };
      case 'Numpad4':
        return { type: 'orbit', azimuth: -1, polar: 0 };
      case 'Numpad6':
        return { type: 'orbit', azimuth: 1, polar: 0 };
      case 'Numpad8':
        return { type: 'orbit', azimuth: 0, polar: -1 };
      case 'Numpad2':
        return { type: 'orbit', azimuth: 0, polar: 1 };
      case 'NumpadDecimal':
        return { type: 'frame' };
      case 'NumpadAdd':
        return { type: 'zoom', direction: 1 };
      case 'NumpadSubtract':
        return { type: 'zoom', direction: -1 };
      default:
        break;
    }
  }

  if (DIGIT_VIEWS[key] && !shiftKey) return { type: 'view', view: DIGIT_VIEWS[key] };

  switch (key) {
    case '+':
    case '=':
      return { type: 'zoom', direction: 1 };
    case '-':
    case '_':
      return { type: 'zoom', direction: -1 };
    case 'r':
    case 'R':
      return { type: 'reset' };
    case 'Home':
      return { type: 'view', view: 'auto' };
    case 'f':
    case 'F':
    case '.':
      return { type: 'frame' };
    case 'Tab':
      return shiftKey ? null : { type: 'toggle-mode' };
    case '?':
      return { type: 'help' };
    case 'Escape':
      return { type: 'escape' };
    case 'g':
    case 'G':
      return context.canTransform && !shiftKey ? { type: 'modal', kind: 'grab' } : null;
    case 's':
    case 'S':
      return context.canTransform && !shiftKey ? { type: 'modal', kind: 'scale' } : null;
    case ']':
      return { type: 'cycle', direction: 1 };
    case '[':
      return { type: 'cycle', direction: -1 };
    default:
      return null;
  }
}

/** True when keys typed here belong to a form field, not to the 3D view. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true;
}

/** The shortcut list shown in the help popover: key labels and the i18n key that describes them. */
export const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['Click'], label: 'viewport.key.select' },
  { keys: ['Double-click', 'F', '.'], label: 'viewport.key.frame' },
  { keys: ['Esc'], label: 'viewport.key.escape' },
  { keys: ['Ctrl Z'], label: 'viewport.key.undo' },
  { keys: ['Ctrl Shift Z', 'Ctrl Y'], label: 'viewport.key.redo' },
  { keys: ['Tab'], label: 'viewport.key.mode' },
  { keys: ['[', ']'], label: 'viewport.key.cycle' },
  { keys: ['G', 'G X/Y/Z'], label: 'viewport.key.grab' },
  { keys: ['S', 'S X/Y/Z'], label: 'viewport.key.scale' },
  { keys: ['1'], label: 'viewport.key.overview' },
  { keys: ['2', 'Num 1'], label: 'viewport.key.front' },
  { keys: ['3', 'Num 3'], label: 'viewport.key.side' },
  { keys: ['4', 'Num 7'], label: 'viewport.key.top' },
  { keys: ['5', 'Num 5'], label: 'viewport.key.inside' },
  { keys: ['6-9'], label: 'viewport.key.focus' },
  { keys: ['Num 2 4 6 8'], label: 'viewport.key.orbit' },
  { keys: ['Num 9', 'Ctrl Num 1/3'], label: 'viewport.key.opposite' },
  { keys: ['+', '-'], label: 'viewport.key.zoom' },
  { keys: ['R', 'Home'], label: 'viewport.key.reset' },
  { keys: ['?'], label: 'viewport.key.help' },
];
