import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { reducedMotion } from "./lib/media";

export const NEAR_BOTTOM = 24;
export const AWAY_FROM_BOTTOM = 96;
const AT_END = 2;

export function scrollRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-zr-scroll]") ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function scrollSource(root: HTMLElement): HTMLElement | Window {
  return root === document.documentElement || root === document.scrollingElement ? window : root;
}

export function scrollToBottom(): void {
  const root = scrollRoot();
  root.scrollTop = root.scrollHeight;
}

export const SWOOP_MS = 400;
export const SWOOP_REACH = 0.35;
export const SWOOP_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const swooping = new WeakMap<HTMLElement, Animation>();

export function swoop(el: HTMLElement | null): void {
  if (!el || typeof el.animate !== "function" || reducedMotion()) return;
  swooping.get(el)?.cancel();
  const reach = Math.round(scrollRoot().clientHeight * SWOOP_REACH);
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

export interface Follow {
  readonly away: boolean;
  readonly toBottom: () => void;
  readonly latest: (content: HTMLElement | null) => void;
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

  const latest = useCallback(
    (content: HTMLElement | null) => {
      toBottom();
      swoop(content);
    },
    [toBottom],
  );

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
    const UP_KEYS = ["ArrowUp", "PageUp", "Home", "k"];
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    let touchY = 0;
    const intent = (e: Event) => {
      const t = e.target as Node;
      if (e instanceof TouchEvent) {
        const y = e.touches[0]?.clientY ?? 0;
        if (e.type === "touchstart") touchY = y;
        else if (y > touchY + 2 && root.contains(t)) stuck.current = false;
        return;
      }
      const up = e instanceof WheelEvent ? e.deltaY < 0 : e instanceof KeyboardEvent ? UP_KEYS.includes(e.key) && !editable(t) : t === root;
      if (up) stuck.current = false;
    };
    const intents = ["wheel", "keydown", "touchstart", "touchmove", "pointerdown"];
    for (const t of intents) window.addEventListener(t, intent, { passive: true, capture: true });
    let width = -1;
    let turned = -Infinity;
    const resized = () => {
      const now = root.clientWidth;
      if (now === width) return false;
      width = now;
      turned = performance.now();
      return true;
    };
    resized();
    const onScroll = () => {
      const y = root.scrollTop;
      measure();
      resized();
      if (y < lastY.current - 1) {
        if (top - y > AT_END && performance.now() - turned > 200) stuck.current = false;
        lastY.current = y;
      } else {
        if (top - y <= NEAR_BOTTOM && y > lastY.current) stuck.current = true;
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
        measure();
        const turn = resized();
        if (paging.current) return;
        if (stuck.current && (turn || root.scrollTop >= lastY.current - 1) && root.scrollTop !== top) {
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
      for (const t of intents) window.removeEventListener(t, intent, { capture: true });
      watch?.disconnect();
    };
  }, [active, pane]);

  return { away, toBottom, latest, snap, paging };
}
