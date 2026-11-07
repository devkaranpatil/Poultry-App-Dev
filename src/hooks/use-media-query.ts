import { useEffect, useState } from 'react';

/** Whether a CSS media query matches, kept in step with the window. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true);

  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Laptops and larger: the journey rail and the docked advisor. */
export const WIDE_QUERY = '(min-width: 1024px)';
