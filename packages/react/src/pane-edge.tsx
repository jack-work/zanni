import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { EASE, EXIT_MS, reducedMotion } from "./motion";

export const EDGE_FLICK = 0.5;
export const EDGE_SLOP = 6;
export const EDGE_OPEN_AT = 1 / 3;

export function edgeSettle(reveal: number, width: number, velocity: number): boolean {
  if (Math.abs(velocity) >= EDGE_FLICK) return velocity > 0;
  return reveal >= width * EDGE_OPEN_AT;
}

function fade(reveal: number, width: number): number {
  return Math.min(1, (2 * reveal) / width);
}

interface Reach {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  moved: boolean;
  reveal: number;
  readonly samples: { t: number; x: number }[];
}

function velocityOf(samples: Reach["samples"], now: number): number {
  const recent = samples.filter((s) => now - s.t <= 100);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t - first.t < 8) return 0;
  return (last.x - first.x) / (last.t - first.t);
}

export interface PaneEdge {
  readonly peek: boolean;
  readonly arrived: RefObject<boolean>;
  readonly zone: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

export function usePaneEdge(pane: RefObject<HTMLElement | null>, enabled: boolean, width: number, onOpen: (() => void) | undefined): PaneEdge {
  const [peek, setPeek] = useState(false);
  const reach = useRef<Reach | null>(null);
  const settling = useRef<Animation | null>(null);
  const arrived = useRef(false);
  const live = useRef({ width, onOpen });
  live.current = { width, onOpen };

  const place = (reveal: number) => {
    const el = pane.current;
    if (!el) return;
    el.style.transform = "translateX(" + (reveal - live.current.width) + "px)";
    el.style.opacity = String(fade(reveal, live.current.width));
  };

  useLayoutEffect(() => {
    if (peek) return;
    settling.current?.cancel();
    settling.current = null;
    const el = pane.current;
    if (!el) return;
    for (const name of ["transform", "opacity", "width"]) el.style.removeProperty(name);
  }, [peek, pane]);

  useEffect(() => {
    if (enabled) return;
    reach.current = null;
    setPeek(false);
  }, [enabled]);

  const settle = (reveal: number, open: boolean) => {
    const el = pane.current;
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      arrived.current = open;
      setPeek(false);
      if (open) live.current.onOpen?.();
    };
    if (!el || reducedMotion() || typeof el.animate !== "function") return end();
    const w = live.current.width;
    const from = { transform: "translateX(" + (reveal - w) + "px)", opacity: fade(reveal, w) };
    const to = { transform: open ? "none" : "translateX(" + -w + "px)", opacity: open ? 1 : 0 };
    const run = el.animate([from, to], { duration: EXIT_MS, easing: EASE, fill: "forwards" });
    settling.current = run;
    run.finished.then(end, end);
  };

  const finish = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const r = reach.current;
    if (!r || r.id !== e.pointerId) return;
    reach.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!r.moved) return;
    settle(r.reveal, !cancelled && edgeSettle(r.reveal, live.current.width, velocityOf(r.samples, e.timeStamp)));
  };

  const zone = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || reach.current || settling.current) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      reach.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, reveal: 0, samples: [{ t: e.timeStamp, x: e.clientX }] };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const r = reach.current;
      if (!r || r.id !== e.pointerId) return;
      const dx = e.clientX - r.x;
      if (!r.moved) {
        if (Math.abs(e.clientY - r.y) > EDGE_SLOP && Math.abs(e.clientY - r.y) > Math.abs(dx)) {
          reach.current = null;
          return;
        }
        if (dx < EDGE_SLOP) return;
        r.moved = true;
        const el = pane.current;
        if (el) el.style.width = live.current.width + "px";
        setPeek(true);
      }
      r.reveal = Math.max(0, Math.min(live.current.width, dx));
      r.samples.push({ t: e.timeStamp, x: e.clientX });
      if (r.samples.length > 12) r.samples.shift();
      place(r.reveal);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => finish(e, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => finish(e, true),
    onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) => finish(e, true),
  };

  return { peek, arrived, zone };
}
