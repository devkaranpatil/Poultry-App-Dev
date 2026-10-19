/** Remembers in this browser that the welcome guide was seen, so it opens only on a first visit. */
export const GUIDE_SEEN_KEY = 'greenhouse.guideSeen';

export function hasSeenGuide() {
  try {
    return window.localStorage.getItem(GUIDE_SEEN_KEY) === '1';
  } catch {
    return true; // without storage, do not nag on every visit
  }
}

export function markGuideSeen() {
  try {
    window.localStorage.setItem(GUIDE_SEEN_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}
