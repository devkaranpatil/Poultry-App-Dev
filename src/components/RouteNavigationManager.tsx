import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const LANDING_HEADER_OFFSET = 96;

function scrollToHashTarget(pathname: string, hash: string, attempt = 0) {
  const targetId = decodeURIComponent(hash.replace(/^#/, ""));
  if (!targetId) return;

  const element = document.getElementById(targetId);
  if (!element) {
    if (attempt < 8) {
      window.setTimeout(() => scrollToHashTarget(pathname, hash, attempt + 1), 80);
    }
    return;
  }

  const offset = pathname === "/" ? LANDING_HEADER_OFFSET : 16;
  const targetY = Math.max(0, element.getBoundingClientRect().top + window.scrollY - offset);
  window.scrollTo({ top: targetY, behavior: "smooth" });
}

export function RouteNavigationManager() {
  const location = useLocation();
  const previousPathRef = useRef(location.pathname);

  useEffect(() => {
    const pathChanged = previousPathRef.current !== location.pathname;

    if (location.hash) {
      scrollToHashTarget(location.pathname, location.hash);
    } else if (pathChanged) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname, location.hash]);

  return null;
}

