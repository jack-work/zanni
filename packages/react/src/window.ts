import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { scrollRoot } from "./follow";

export const ESTIMATE = 400;
export const TAIL = 3;

export interface Span {
  readonly from: number;
  readonly to: number;
}

export function planWindow(count: number, anchor: number, view: number, extra: readonly number[], height: (i: number) => number): { spans: Span[]; gaps: number[] } {
  const keep = new Uint8Array(count);
  let lo = anchor;
  let hi = anchor + 1;
  for (let acc = 0; lo > 0 && acc < view * 2; ) acc += height(--lo);
  for (let acc = 0; hi < count && acc < view * 3; ) acc += height(hi++);
  keep.fill(1, lo, hi);
  keep.fill(1, Math.max(0, count - TAIL));
  for (const i of extra) keep[i] = 1;
  const spans: Span[] = [];
  const gaps: number[] = [];
  let gap = 0;
  let cur: { from: number; to: number } | null = null;
  for (let i = 0; i < count; i++) {
    if (!keep[i]) {
      cur = null;
      gap += height(i);
    } else if (cur) cur.to = i + 1;
    else {
      cur = { from: i, to: i + 1 };
      spans.push(cur);
      gaps.push(gap);
      gap = 0;
    }
  }
  return { spans, gaps };
}

let sheet: CSSStyleSheet | undefined;

function setGap(slot: number, px: number): void {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  while (sheet.cssRules.length <= slot) sheet.insertRule('.nodi-gap[data-slot="' + sheet.cssRules.length + '"] {}', sheet.cssRules.length);
  (sheet.cssRules[slot] as CSSStyleRule).style.height = px + "px";
}

export function useTurnWindow(turns: readonly { readonly turn: number }[], list: RefObject<HTMLElement | null>, extra: readonly number[]) {
  const windowed = typeof ResizeObserver !== "undefined";
  const heights = useRef(new Map<number, number>());
  const view = useRef(900);
  const [anchor, setAnchor] = useState<number | null>(null);
  const latest = useRef(turns);
  latest.current = turns;
  const watch = useRef<ResizeObserver | null>(null);
  const height = (i: number) => heights.current.get(latest.current[i]!.turn) ?? ESTIMATE;
  const at = anchor === null ? -1 : turns.findIndex((t) => t.turn === anchor);
  const plan = planWindow(turns.length, at < 0 ? turns.length - 1 : at, windowed ? view.current : Infinity, extra.map((t) => turns.findIndex((x) => x.turn === t)), height);
  const key = plan.spans.map((s) => s.from + "-" + s.to).join();

  useLayoutEffect(() => {
    plan.gaps.forEach((g, i) => windowed && setGap(i, g));
  }, [plan.gaps.join(), windowed]);

  useLayoutEffect(() => {
    if (!windowed || !list.current) return;
    watch.current ??= new ResizeObserver((entries) => {
      for (const e of entries) heights.current.set(Number((e.target as HTMLElement).dataset.turn), e.borderBoxSize[0]!.blockSize);
    });
    watch.current.disconnect();
    list.current.querySelectorAll<HTMLElement>(".nodi-turn").forEach((t) => watch.current!.observe(t));
    return () => watch.current?.disconnect();
  }, [key, windowed, list]);

  const top = useCallback(() => {
    const root = scrollRoot();
    return root.scrollTop - (list.current!.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop);
  }, [list]);

  useEffect(() => {
    if (!windowed) return;
    const root = scrollRoot();
    let frame = 0;
    const read = () => {
      frame = 0;
      view.current = root.clientHeight;
      const all = latest.current;
      let acc = 0;
      let i = 0;
      for (const y = top(); i < all.length - 1 && (acc += heights.current.get(all[i]!.turn) ?? ESTIMATE) <= y; i++);
      setAnchor(all[i]?.turn ?? null);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(read);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [windowed, top]);

  const jump = useCallback(
    (turn: number) => {
      const all = latest.current;
      const i = all.findIndex((t) => t.turn === turn);
      if (!windowed || i < 0 || !list.current) return false;
      let y = 0;
      for (let j = 0; j < i; j++) y += heights.current.get(all[j]!.turn) ?? ESTIMATE;
      setAnchor(turn);
      scrollRoot().scrollTop += y - top();
      return true;
    },
    [windowed, list, top],
  );

  return { spans: plan.spans, jump };
}
