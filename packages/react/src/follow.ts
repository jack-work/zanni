import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const NEAR_BOTTOM = 24;
export const AWAY_FROM_BOTTOM = 96;
const AT_END = 2;

export function scrollRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-zr-scroll]") ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function scrollSource(root: HTMLElement): HTMLElement | Window {
  return root === document.documentElement || root === document.scrollingElement ? window : root;
}

export function distanceFromBottom(): number {
  const root = scrollRoot();
  return root.scrollHeight - root.clientHeight - root.scrollTop;
}

export function scrollToBottom(): void {
  const root = scrollRoot();
  root.scrollTop = root.scrollHeight;
}

export interface Follow {
  readonly away: boolean;
  readonly toBottom: () => void;
  readonly snap: () => void;
  readonly paging: RefObject<boolean>;
}

export function useFollow(pane: RefObject<HTMLElement | null>, active: boolean): Follow {
  const stuck = useRef(true);
  const lastY = useRef(0);
  const paging = useRef(false);
  const [away, setAway] = useState(false);

  const toBottom = useCallback(() => {
    stuck.current = true;
    setAway(false);
    let frames = 0;
    let at = 0;
    const pin = () => {
      if (scrollRoot().scrollTop < at - 1) return;
      scrollToBottom();
      at = scrollRoot().scrollTop;
      if (stuck.current && ++frames < 30) requestAnimationFrame(pin);
    };
    pin();
  }, []);

  const snap = useCallback(() => {
    const root = scrollRoot();
    if (!stuck.current || paging.current || root.scrollTop < lastY.current - 1) return;
    const end = root.scrollHeight - root.clientHeight;
    if (root.scrollTop === end) return;
    root.scrollTop = end;
    lastY.current = root.scrollTop;
  }, []);

  useEffect(() => {
    if (!active) return;
    const root = scrollRoot();
    let top = 0;
    const measure = () => {
      top = Math.max(0, root.scrollHeight - root.clientHeight);
    };
    measure();
    lastY.current = root.scrollTop;
    const judge = () => setAway(top - root.scrollTop > AWAY_FROM_BOTTOM);
    const onScroll = () => {
      const y = root.scrollTop;
      measure();
      if (y < lastY.current - 1) {
        if (top - y > AT_END) stuck.current = false;
        lastY.current = y;
      } else {
        if (top - y <= NEAR_BOTTOM && y >= lastY.current) stuck.current = true;
        lastY.current = Math.max(lastY.current, y);
      }
      judge();
    };
    judge();
    const source = scrollSource(root);
    source.addEventListener("scroll", onScroll, { passive: true });
    const el = pane.current;
    let watch: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      watch = new ResizeObserver(() => {
        const h = el.getBoundingClientRect().height;
        measure();
        if (paging.current) return;
        if (stuck.current && root.scrollTop >= lastY.current - 1 && root.scrollTop !== top) {
          root.scrollTop = top;
          lastY.current = root.scrollTop;
        }
        judge();
      });
      watch.observe(el);
      if (root !== document.documentElement) watch.observe(root);
    }
    return () => {
      source.removeEventListener("scroll", onScroll);
      watch?.disconnect();
    };
  }, [active, pane]);

  return { away, toBottom, snap, paging };
}
