import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns `path` only if it is a same-origin app path ("/visualizer?x=1"),
 * otherwise `fallback`. Rejects protocol-relative ("//evil") and backslash
 * ("/\\evil") forms that browsers resolve to another origin.
 */
export function safeRedirectPath(path: unknown, fallback = "/dashboard"): string {
  if (typeof path !== "string" || !path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.includes("\\")) return fallback;
  return path;
}
