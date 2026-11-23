import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const NEAR_BOTTOM = 160;
export const AWAY_FROM_BOTTOM = 96;

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
    scrollToBottom();
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
      if (top - y <= NEAR_BOTTOM) stuck.current = true;
      else if (y < lastY.current) stuck.current = false;
      lastY.current = y;
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
        if (stuck.current) root.scrollTop = top;
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

  return { away, toBottom, paging };
}
