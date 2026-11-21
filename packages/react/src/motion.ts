import { useEffect, useState } from "react";

export const EXIT_MS = 160;

export function reducedMotion(): boolean {
  return typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useLinger(show: boolean, ms: number = EXIT_MS): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(show);
  const instant = reducedMotion();
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const id = setTimeout(() => setMounted(false), instant ? 0 : ms);
    return () => clearTimeout(id);
  }, [show, mounted, ms, instant]);
  return { mounted: show || (!instant && mounted), leaving: !show && !instant && mounted };
}

export function transition(change: () => void): void {
  const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (typeof start !== "function" || reducedMotion()) {
    change();
    return;
  }
  start.call(document, change);
}
