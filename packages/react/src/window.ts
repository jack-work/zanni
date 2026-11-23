import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { scrollRoot } from "./follow";

export const ESTIMATE = 400;
export const TAIL = 3;
export const MARGIN_VIEWS = 2;
const DEFAULT_VIEW = 900;
const MAX_GAPS = 8;

export interface Span {
  readonly from: number;
  readonly to: number;
}

export interface Plan {
  readonly spans: readonly Span[];
  readonly gaps: readonly number[];
}

export function planWindow(count: number, anchor: number, view: number, extra: readonly number[], height: (i: number) => number): Plan {
  if (count === 0) return { spans: [], gaps: [] };
  const margin = view * MARGIN_VIEWS;
  let lo = anchor;
  for (let acc = 0; lo > 0 && acc < margin; ) acc += height(--lo);
  let hi = anchor;
  for (let acc = 0; hi < count && acc < view + margin; ) acc += height(hi++);
  const picks: Span[] = [{ from: lo, to: Math.max(hi, anchor + 1) }, { from: Math.max(0, count - TAIL), to: count }];
  for (const i of extra) if (i >= 0 && i < count) picks.push({ from: i, to: i + 1 });
  picks.sort((a, b) => a.from - b.from);
  const spans: Span[] = [];
  for (const p of picks) {
    const last = spans[spans.length - 1];
    if (last && p.from <= last.to) spans[spans.length - 1] = { from: last.from, to: Math.max(last.to, p.to) };
    else spans.push(p);
  }
  const gaps: number[] = [];
  let at = 0;
  for (const s of spans) {
    let sum = 0;
    for (let i = at; i < s.from; i++) sum += height(i);
    gaps.push(sum);
    at = s.to;
  }
  return { spans, gaps };
}

export function turnAt(count: number, y: number, height: (i: number) => number): number {
  let acc = 0;
  for (let i = 0; i < count; i++) {
    acc += height(i);
    if (acc > y) return i;
  }
  return Math.max(0, count - 1);
}

let sheet: CSSStyleSheet | undefined;
const rules: CSSStyleRule[] = [];

function gapRule(slot: number): CSSStyleRule {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  while (rules.length <= slot) {
    sheet.insertRule('.nodi-gap[data-slot="' + rules.length + '"] {}', sheet.cssRules.length);
    rules.push(sheet.cssRules[sheet.cssRules.length - 1] as CSSStyleRule);
  }
  return rules[slot]!;
}

export interface TurnWindow {
  readonly spans: readonly Span[];
  readonly windowed: boolean;
  readonly jump: (turn: number) => void;
}

export function useTurnWindow(turns: readonly { readonly turn: number }[], list: RefObject<HTMLElement | null>, extra: readonly number[]): TurnWindow {
  const windowed = typeof ResizeObserver !== "undefined" && typeof CSSStyleSheet !== "undefined";
  const heights = useRef(new Map<number, number>());
  const view = useRef(DEFAULT_VIEW);
  const [anchor, setAnchor] = useState<number | null>(null);
  const latest = useRef(turns);
  latest.current = turns;
  const height = (i: number) => heights.current.get(turns[i]!.turn) ?? ESTIMATE;
  const at = anchor === null ? -1 : turns.findIndex((t) => t.turn === anchor);
  const plan = windowed ? planWindow(turns.length, at < 0 ? turns.length - 1 : at, view.current, extra.map((t) => turns.findIndex((x) => x.turn === t)), height) : { spans: [{ from: 0, to: turns.length }], gaps: [0] };
  const key = plan.spans.map((s) => s.from + "-" + s.to).join(",");
  const gapsKey = plan.gaps.join(",");
  const watch = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    if (!windowed) return;
    plan.gaps.slice(0, MAX_GAPS).forEach((g, i) => {
      gapRule(i).style.height = g + "px";
    });
  }, [gapsKey, windowed]);

  useLayoutEffect(() => {
    const el = list.current;
    if (!windowed || !el) return;
    if (!watch.current) {
      watch.current = new ResizeObserver((entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.turn);
          if (n) heights.current.set(n, e.borderBoxSize[0]?.blockSize ?? e.contentRect.height);
        }
      });
    }
    watch.current.disconnect();
    el.querySelectorAll<HTMLElement>(".nodi-turn").forEach((t) => watch.current!.observe(t));
  }, [key, windowed, list]);

  useEffect(() => () => watch.current?.disconnect(), []);

  useEffect(() => {
    if (!windowed) return;
    const root = scrollRoot();
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = list.current;
      if (!el) return;
      view.current = root.clientHeight || DEFAULT_VIEW;
      const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      const turns = latest.current;
      const i = turnAt(turns.length, root.scrollTop - top, (j) => heights.current.get(turns[j]!.turn) ?? ESTIMATE);
      const n = turns[i]?.turn ?? null;
      setAnchor((prev) => (prev === n ? prev : n));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [windowed, list]);

  const jump = useCallback(
    (turn: number) => {
      const root = scrollRoot();
      const el = list.current;
      const turns = latest.current;
      const i = turns.findIndex((t) => t.turn === turn);
      if (!windowed || !el || i < 0) return;
      let y = 0;
      for (let j = 0; j < i; j++) y += heights.current.get(turns[j]!.turn) ?? ESTIMATE;
      const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      setAnchor(turn);
      root.scrollTop = top + y;
    },
    [windowed, list],
  );

  return { spans: plan.spans, windowed, jump };
}
