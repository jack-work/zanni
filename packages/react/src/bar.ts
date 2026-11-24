import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { rootVar } from "./rootvars";

export const BAR_HEIGHT_VAR = "--proscenio-height";
export const BAR_PAD_VAR = "--proscenio-pad";
export const BAR_SHOWN_VAR = "--proscenio-shown";

const SCROLL_SLOP = 4;
const TAP_ZONE = 48;
const TAP_MS = 350;
const TAP_SLOP = 10;
const SWALLOW_MS = 500;

function rendered(bar: HTMLElement | null): bar is HTMLElement {
  return !!bar && bar.getClientRects().length > 0;
}

export function useBar(bar: RefObject<HTMLElement | null>, scroller: RefObject<HTMLElement | null>, narrow: boolean, overlaid: boolean): readonly [boolean, () => void] {
  const [hidden, setHidden] = useState(false);
  const [height, setHeight] = useState(0);
  const state = useRef({ hidden, overlaid });
  state.current = { hidden, overlaid };
  const show = useCallback(() => setHidden(false), []);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => setHeight(rendered(el) ? Math.round(el.getBoundingClientRect().height) : 0);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [bar, narrow]);

  useLayoutEffect(() => {
    rootVar(BAR_HEIGHT_VAR, height + "px");
    rootVar(BAR_PAD_VAR, (narrow ? height : 0) + "px");
    rootVar(BAR_SHOWN_VAR, (narrow && !hidden ? height : 0) + "px");
  }, [height, narrow, hidden]);

  useEffect(
    () => () => {
      rootVar(BAR_HEIGHT_VAR, null);
      rootVar(BAR_PAD_VAR, null);
      rootVar(BAR_SHOWN_VAR, null);
    },
    [],
  );

  useEffect(() => {
    if (!narrow) setHidden(false);
  }, [narrow]);

  useEffect(() => {
    const root = scroller.current;
    if (!narrow || !root) return;
    const last = new WeakMap<EventTarget, number>();
    const onScroll = (e: Event) => {
      const el = bar.current;
      const target = e.target as HTMLElement;
      if (!rendered(el)) return;
      const y = target.scrollTop;
      const prev = last.get(target) ?? 0;
      last.set(target, y);
      if (y <= el.offsetHeight) setHidden(false);
      else if (y - prev > SCROLL_SLOP && !state.current.overlaid) setHidden(true);
      else if (prev - y > SCROLL_SLOP) setHidden(false);
    };
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => root.removeEventListener("scroll", onScroll, true);
  }, [bar, scroller, narrow]);

  useEffect(() => {
    if (!narrow) return;
    let tap: { x: number; y: number; at: number; selection: string } | null = null;
    const moved = (e: PointerEvent, t: { x: number; y: number }) => Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP;
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const down = (e: PointerEvent) => {
      tap = state.current.hidden && rendered(bar.current) && e.isPrimary && e.clientY < TAP_ZONE ? { x: e.clientX, y: e.clientY, at: e.timeStamp, selection: String(getSelection()) } : null;
    };
    const move = (e: PointerEvent) => {
      if (tap && moved(e, tap)) tap = null;
    };
    const up = (e: PointerEvent) => {
      const t = tap;
      tap = null;
      if (!t || moved(e, t) || e.timeStamp - t.at > TAP_MS || String(getSelection()) !== t.selection) return;
      setHidden(false);
      document.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallow, true), SWALLOW_MS);
    };
    document.addEventListener("pointerdown", down, { capture: true, passive: true });
    document.addEventListener("pointermove", move, { capture: true, passive: true });
    document.addEventListener("pointerup", up, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
    };
  }, [bar, narrow]);

  return [hidden, show];
}
