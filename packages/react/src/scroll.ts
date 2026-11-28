import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type RefObject } from "react";
import { swoop } from "./motion";

export const NEAR_BOTTOM = 24;
const AWAY_FROM_BOTTOM = 96;
const AT_END = 2;
const ROTATION_MS = 200;
const COAST_MS = 500;
const SPACING = 24;
const ESTIMATE = 400 + SPACING;
const TAIL = 3;
const BEHIND = 1800;
const AHEAD = 2700;

export function scrollRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-zr-scroll]") ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

const isViewport = (root: HTMLElement): boolean => root === document.documentElement || root === document.scrollingElement;

export function watchScroll(root: HTMLElement, fn: () => void): () => void {
  const source: HTMLElement | Window = isViewport(root) ? window : root;
  source.addEventListener("scroll", fn, { passive: true });
  return () => source.removeEventListener("scroll", fn);
}

export const scrollEdge = (root: HTMLElement): number => (isViewport(root) ? 0 : root.getBoundingClientRect().top);

const endOf = (root: HTMLElement): number => Math.max(0, root.scrollHeight - root.clientHeight);

function restingTop(el: HTMLElement): number {
  const shift = typeof DOMMatrix === "function" ? new DOMMatrix(getComputedStyle(el).transform).m42 : 0;
  return el.getBoundingClientRect().top - shift;
}

const originOf = (root: HTMLElement, list: HTMLElement | null | undefined): number => (list ? restingTop(list) - scrollEdge(root) + root.scrollTop : 0);

let sheet: CSSStyleSheet | undefined;
const set = [NaN, NaN];

function setGap(slot: number, px: number): void {
  if (!document.adoptedStyleSheets) return;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync('[data-slot="0"] {} [data-slot="1"] {}');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  if (set[slot] === px) return;
  set[slot] = px;
  (sheet.cssRules[slot] as CSSStyleRule).style.height = px + "px";
}

interface Held {
  readonly turn: number;
  readonly key: string;
}

type Heights = Record<string, number>;

const sizeIn = (heights: Heights, all: readonly Held[], i: number): number => heights[all[i]!.turn] ?? ESTIMATE;

function offsetIn(heights: Heights, all: readonly Held[], i: number): number {
  let sum = 0;
  for (let k = 0; k < i; k++) sum += sizeIn(heights, all, k);
  return sum;
}

function indexAt(heights: Heights, all: readonly Held[], y: number): number {
  let acc = 0;
  let i = 0;
  for (; i < all.length - 1 && acc + sizeIn(heights, all, i) <= y; i++) acc += sizeIn(heights, all, i);
  return i;
}

type Span = readonly [from: number, to: number, gap: boolean];

export interface TranscriptScroll {
  readonly spans: readonly Span[];
  readonly away: boolean;
  readonly toEnd: () => void;
  readonly latest: (list: HTMLElement | null) => void;
  readonly reveal: (turn: number) => void;
  readonly readerAt: () => number | undefined;
}

type Aim = { readonly end: true } | { readonly end: false; readonly turn: number };

const UP_KEYS = ["ArrowUp", "PageUp", "Home", "k"];

const editable = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function useTranscriptScroll(turns: readonly Held[], pane: RefObject<HTMLElement | null>, active: boolean): TranscriptScroll {
  const heights = useRef<Heights>({});
  const [anchor, setAnchor] = useState(-1);
  const [away, setAway] = useState(false);
  const [, commit] = useReducer((n: number) => n + 1, 0);
  const pinned = useRef(true);
  const aim = useRef<Aim | null>(null);
  const last = useRef(0);
  const turned = useRef(-Infinity);
  const jumped = useRef(-Infinity);
  const place = useRef<{ turn: number; at: number } | null>(null);
  const held = useRef(turns);
  held.current = turns;
  const seen = useRef(0);
  seen.current = scrollRoot().scrollTop;

  const n = turns.length;
  const at = turns.findIndex((t) => t.turn === anchor);
  let lo = at < 0 ? n - 1 : at;
  let hi = lo + 1;
  for (let a = 0; lo > 0 && a < BEHIND; ) a += sizeIn(heights.current, turns, --lo);
  for (let a = 0; hi < n && a < AHEAD; ) a += sizeIn(heights.current, turns, hi++);
  const tail = Math.max(hi, n - TAIL);
  const spans: readonly Span[] = [
    [lo, hi, lo > 0],
    [tail, n, tail > hi],
  ];

  const listOf = () => pane.current?.querySelector<HTMLElement>(".nodi-turns");

  const put = (root: HTMLElement, y: number) => {
    if (Math.abs(root.scrollTop - y) < 1) return;
    root.scrollTop = y;
    last.current = root.scrollTop;
  };

  const release = () => {
    pinned.current = false;
    aim.current = null;
  };

  const notice = (root: HTMLElement, y: number = root.scrollTop) => {
    const end = endOf(root);
    const now = performance.now();
    if (y < last.current - 1) {
      const gone = end - y;
      if (gone > AT_END && now - jumped.current < COAST_MS && gone <= root.clientHeight) {
        last.current = y;
        put(root, end);
        return end;
      }
      if (gone > AT_END && (now - turned.current > ROTATION_MS || gone > root.clientHeight)) release();
    } else if (y > last.current + 1 && end - y <= NEAR_BOTTOM) pinned.current = true;
    last.current = y;
    return end;
  };

  const mark = (root: HTMLElement): number => {
    const all = held.current;
    const base = originOf(root, listOf());
    const i = indexAt(heights.current, all, root.scrollTop - base);
    if (all[i]) place.current = { turn: all[i]!.turn, at: base + offsetIn(heights.current, all, i) };
    return all[i]?.turn ?? -1;
  };

  const keep = (root: HTMLElement) => {
    const all = held.current;
    document.querySelectorAll<HTMLElement>(".nodi-turn").forEach((t) => (heights.current[t.dataset.turn!] = t.offsetHeight + SPACING));
    const kept = place.current;
    const at = kept ? all.findIndex((t) => t.turn === kept.turn) : -1;
    if (kept && at >= 0) put(root, root.scrollTop + originOf(root, listOf()) + offsetIn(heights.current, all, at) - kept.at);
    mark(root);
  };

  const judge = (root: HTMLElement) => setAway(endOf(root) - root.scrollTop > AWAY_FROM_BOTTOM);

  useLayoutEffect(() => {
    const fit = () => {
      let top = 0;
      let mid = 0;
      for (let i = 0; i < tail; i++) if (i < lo) top += sizeIn(heights.current, turns, i);
      else if (i >= hi) mid += sizeIn(heights.current, turns, i);
      setGap(0, top - SPACING);
      setGap(1, mid - SPACING);
    };
    fit();
    document.querySelectorAll<HTMLElement>(".nodi-turn").forEach((t) => (heights.current[t.dataset.turn!] = t.offsetHeight + SPACING));
    const oldest = turns[0]?.turn ?? 0;
    for (const k of Object.keys(heights.current)) if (Number(k) < oldest) delete heights.current[k];
    fit();

    const root = scrollRoot();
    notice(root, seen.current);
    const want = aim.current;
    const target = want && !want.end ? document.querySelector<HTMLElement>('.nodi-turn[data-turn="' + want.turn + '"]') : null;
    const kept = place.current;
    const keptAt = kept ? turns.findIndex((t) => t.turn === kept.turn) : -1;
    if (target) {
      aim.current = null;
      put(root, root.scrollTop + target.getBoundingClientRect().top - scrollEdge(root));
    } else if (pinned.current) {
      aim.current = null;
      put(root, endOf(root));
    } else {
      const shift = kept && keptAt >= 0 ? originOf(root, listOf()) + offsetIn(heights.current, turns, keptAt) - kept.at : 0;
      put(root, last.current + shift);
    }
    if (!pinned.current) mark(root);
    judge(root);
  });

  useEffect(() => {
    if (!active) return;
    const root = scrollRoot();
    last.current = root.scrollTop;
    let touchY = 0;
    const intent = (e: Event) => {
      const t = e.target as Node;
      jumped.current = -Infinity;
      if (e.type === "touchstart" || e.type === "touchmove") {
        const y = (e as TouchEvent).touches[0]?.clientY ?? 0;
        if (e.type === "touchstart") touchY = y;
        else if (y > touchY + 2 && root.contains(t)) release();
        return;
      }
      const up = e instanceof WheelEvent ? e.deltaY < 0 : e instanceof KeyboardEvent ? UP_KEYS.includes(e.key) && !editable(t) : t === root;
      if (up) release();
    };
    const intents = ["wheel", "keydown", "touchstart", "touchmove", "pointerdown"];
    for (const t of intents) window.addEventListener(t, intent, { passive: true, capture: true });

    let width = root.clientWidth;
    const onScroll = () => {
      const end = notice(root);
      setAnchor(pinned.current ? -1 : mark(root));
      setAway(end - root.scrollTop > AWAY_FROM_BOTTOM);
    };
    const stop = watchScroll(root, onScroll);

    let watch: ResizeObserver | undefined;
    const el = pane.current;
    if (el && typeof ResizeObserver !== "undefined") {
      watch = new ResizeObserver(() => {
        if (root.clientWidth !== width) {
          width = root.clientWidth;
          turned.current = performance.now();
        }
        notice(root);
        if (pinned.current) put(root, endOf(root));
        else keep(root);
        judge(root);
      });
      watch.observe(el);
      if (!isViewport(root)) watch.observe(root);
    }
    return () => {
      stop();
      for (const t of intents) window.removeEventListener(t, intent, { capture: true });
      watch?.disconnect();
    };
  }, [active, pane]);

  const toEnd = useCallback(() => {
    notice(scrollRoot());
    pinned.current = true;
    aim.current = { end: true };
    setAnchor(-1);
    setAway(false);
    commit();
  }, []);

  const latest = useCallback(
    (list: HTMLElement | null) => {
      toEnd();
      jumped.current = performance.now();
      swoop(list);
    },
    [toEnd],
  );

  const reveal = useCallback((turn: number) => {
    pinned.current = false;
    aim.current = { end: false, turn };
    setAnchor(turn);
    commit();
  }, []);

  const readerAt = useCallback(() => (pinned.current ? undefined : place.current?.turn), []);

  return { spans, away, toEnd, latest, reveal, readerAt };
}
