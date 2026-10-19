import { normalizeGreenhouseConfig, type GreenhouseConfig } from '@/types/greenhouse';

export const SHARE_PARAM = 'setup';
const DRAFT_STORAGE_KEY = 'greenhouse.draft.v1';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/** Compact, URL-safe encoding of a setup for share links. */
export function encodeShareParam(config: GreenhouseConfig): string {
  return toBase64Url(JSON.stringify(normalizeGreenhouseConfig(config)));
}

/** Decodes a share link value; returns null for anything malformed. */
export function decodeShareParam(value: string | null): GreenhouseConfig | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return normalizeGreenhouseConfig(parsed as Partial<GreenhouseConfig>);
  } catch {
    return null;
  }
}

export function buildShareUrl(config: GreenhouseConfig, origin = window.location.origin): string {
  const url = new URL('/visualizer', origin);
  url.searchParams.set(SHARE_PARAM, encodeShareParam(config));
  return url.toString();
}

export function loadDraft(): GreenhouseConfig | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return normalizeGreenhouseConfig(parsed as Partial<GreenhouseConfig>);
  } catch {
    return null;
  }
}

/** Forgets the working draft, so the designer starts from an empty setup. */
export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}

export function saveDraft(config: GreenhouseConfig): void {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage can be full or blocked (private mode); the draft is a convenience only.
  }
}
