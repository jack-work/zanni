import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const NEAR_BOTTOM = 160;

export function distanceFromBottom(): number {
  return document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
}

export function scrollToBottom(): void {
  window.scrollTo(0, document.documentElement.scrollHeight);
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
    lastY.current = window.scrollY;
    stuck.current = distanceFromBottom() <= NEAR_BOTTOM;
    const onScroll = () => {
      const y = window.scrollY;
      if (distanceFromBottom() <= NEAR_BOTTOM) {
        stuck.current = true;
        setUnseen(false);
      } else if (y < lastY.current) stuck.current = false;
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const el = pane.current;
    let watch: ResizeObserver | undefined;
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
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      watch?.disconnect();
    };
  }, [active, pane]);

  return { unseen, toBottom, paging };
}
