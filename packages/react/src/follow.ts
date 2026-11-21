import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const NEAR_BOTTOM = 160;

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
  readonly unseen: boolean;
  readonly toBottom: () => void;
  readonly paging: RefObject<boolean>;
}

export function useFollow(pane: RefObject<HTMLElement | null>, active: boolean): Follow {
  const stuck = useRef(true);
  const lastY = useRef(0);
  const height = useRef(0);
  const paging = useRef(false);
  const [unseen, setUnseen] = useState(false);

  const toBottom = useCallback(() => {
    stuck.current = true;
    setUnseen(false);
    scrollToBottom();
  }, []);

  useEffect(() => {
    if (!active) return;
    const root = scrollRoot();
    lastY.current = root.scrollTop;
    stuck.current = distanceFromBottom() <= NEAR_BOTTOM;
    const onScroll = () => {
      const y = root.scrollTop;
      if (distanceFromBottom() <= NEAR_BOTTOM) {
        stuck.current = true;
        setUnseen(false);
      } else if (y < lastY.current) stuck.current = false;
      lastY.current = y;
    };
    const source = scrollSource(root);
    source.addEventListener("scroll", onScroll, { passive: true });
    const el = pane.current;
    let watch: ResizeObserver | undefined;
    let frame: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      height.current = el.getBoundingClientRect().height;
      watch = new ResizeObserver(() => {
        const h = el.getBoundingClientRect().height;
        const grew = h > height.current;
        height.current = h;
        if (paging.current) return;
        if (stuck.current) scrollToBottom();
        else if (grew) setUnseen(true);
      });
      watch.observe(el);
      if (root !== document.documentElement) {
        frame = new ResizeObserver(() => {
          if (stuck.current && !paging.current) scrollToBottom();
        });
        frame.observe(root);
      }
    }
    return () => {
      source.removeEventListener("scroll", onScroll);
      watch?.disconnect();
      frame?.disconnect();
    };
  }, [active, pane]);

  return { unseen, toBottom, paging };
}
