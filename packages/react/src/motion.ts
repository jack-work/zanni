import { useEffect, useState } from "react";
import { reducedMotion } from "./lib/media";

export const EXIT_MS = 160;
export const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

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

export const SWOOP_MS = 400;
export const SWOOP_REACH = 0.35;
export const SWOOP_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const swooping = new WeakMap<HTMLElement, Animation>();

export function swoop(el: HTMLElement | null): void {
  if (!el || typeof el.animate !== "function" || reducedMotion()) return;
  swooping.get(el)?.cancel();
  const reach = Math.round((el.closest<HTMLElement>("[data-zr-scroll]") ?? document.documentElement).clientHeight * SWOOP_REACH);
  if (reach <= 0) return;
  el.setAttribute("data-swooping", "");
  const run = el.animate(
    [
      { transform: "translateY(" + -reach + "px)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    { duration: SWOOP_MS, easing: SWOOP_EASE },
  );
  swooping.set(el, run);
  const done = () => {
    if (swooping.get(el) !== run) return;
    swooping.delete(el);
    el.removeAttribute("data-swooping");
  };
  run.addEventListener("finish", done);
  run.addEventListener("cancel", done);
}
