import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useDialog } from "./dialog";
import { useLinger } from "./motion";
import { viewportHeight } from "./viewport";

export type PitSnap = "closed" | "half" | "full";

export const PIT_HALF_MIN = 640;
export const PIT_SLOP = 6;
export const PIT_TOUCH_SLOP = 10;
export const PIT_FLICK = 0.4;
export const PIT_PROJECT_MS = 240;
export const PIT_SETTLE_MS = 500;
export const PIT_SCROLL_GUARD_MS = 100;

const ALL: PitSnap[] = ["closed", "half", "full"];

export interface PitFrame {
  view: number;
  rest: number;
  top: number;
}

export function pitDetents(detents: readonly PitSnap[], view: number): PitSnap[] {
  return ALL.filter((s) => detents.includes(s) && (s !== "half" || view >= PIT_HALF_MIN));
}

export function pitStop(snap: PitSnap, f: PitFrame): number {
  return snap === "closed" ? 0 : snap === "half" ? f.rest - f.view / 2 : f.rest - f.view + f.top;
}

export function pitRubber(y: number, f: PitFrame): number {
  const top = pitStop("full", f);
  if (y >= top) return Math.min(0, y);
  const over = top - y;
  return top - (over * 0.55 * f.view) / (f.view + 0.55 * over);
}

export function pitSettle(y: number, velocity: number, f: PitFrame, snaps: readonly PitSnap[]): PitSnap {
  const stops = snaps.map((s) => ({ s, at: pitStop(s, f) }));
  const aim = y + velocity * PIT_PROJECT_MS;
  let best = stops[0]!;
  for (const st of stops) if (Math.abs(st.at - aim) < Math.abs(best.at - aim)) best = st;
  if (Math.abs(velocity) < PIT_FLICK) return best.s;
  const ahead = stops.filter((st) => (velocity < 0 ? st.at < y - 1 : st.at > y + 1));
  if (!ahead.length) return best.s;
  if (ahead.includes(best)) return best.s;
  return (velocity < 0 ? ahead[0]! : ahead[ahead.length - 1]!).s;
}

export function pitStep(snap: PitSnap, direction: 1 | -1, snaps: readonly PitSnap[]): PitSnap {
  const at = Math.max(0, snaps.indexOf(snap)) + direction;
  return snaps[Math.max(0, Math.min(snaps.length - 1, at))]!;
}

function velocityOf(samples: { t: number; y: number }[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= 100);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t - first.t < 8) return 0;
  return (last.y - first.y) / (last.t - first.t);
}

function useWide(): boolean {
  const query = "(min-width: 900px)";
  const [wide, setWide] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const on = () => setWide(list.matches);
    list.addEventListener("change", on);
    return () => list.removeEventListener("change", on);
  }, []);
  return wide;
}

function translateOf(el: HTMLElement): number | null {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none" || typeof DOMMatrixReadOnly === "undefined") return null;
  return new DOMMatrixReadOnly(t).m42;
}

function selecting(target: HTMLElement): boolean {
  const box = target.closest("textarea, input");
  return !!box && box === document.activeElement && (box as HTMLTextAreaElement).selectionStart !== (box as HTMLTextAreaElement).selectionEnd;
}

function swallowClick(): void {
  const eat = (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
  };
  window.addEventListener("click", eat, true);
  setTimeout(() => window.removeEventListener("click", eat, true), 0);
}

interface Drag {
  startY: number;
  startX: number;
  from: number;
  y: number;
  moved: boolean;
  slop: number;
  frame: PitFrame;
  snaps: PitSnap[];
  samples: { t: number; y: number }[];
}

export interface PitProps {
  snap: PitSnap;
  onSnapChange: (snap: PitSnap) => void;
  label: string;
  detents?: readonly PitSnap[];
  head?: ReactNode;
  knobLabel?: string;
  closeLabel?: string;
  docked?: boolean;
  className?: string;
  data?: Record<`data-${string}`, string | undefined>;
  children: ReactNode;
}

export function Pit({ snap: asked, onSnapChange, label, detents = ALL, head, knobLabel = "Open controls", closeLabel = "Close controls", docked, className, data, children }: PitProps) {
  const wide = useWide();
  const side = docked ?? wide;
  const drawer = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const scrim = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const decided = useRef<PitSnap[] | null>(null);
  if (asked === "closed" && !dragging && !drag.current) decided.current = null;
  if (asked !== "closed" && !decided.current) decided.current = pitDetents(detents, viewportHeight());
  const snaps = decided.current ?? pitDetents(detents, viewportHeight());
  const snap: PitSnap = snaps.includes(asked) ? asked : asked === "closed" ? "closed" : snaps[snaps.length - 1]!;
  const open = snap !== "closed" || dragging;
  const { mounted, leaving } = useLinger(open, PIT_SETTLE_MS);
  const last = useRef<ReactNode>(null);
  if (open) last.current = children;
  const live = useRef({ snap, onSnapChange, snaps, detents });
  live.current = { snap, onSnapChange, snaps, detents };

  const frame = useCallback((): PitFrame => {
    const el = drawer.current;
    return { view: viewportHeight(), rest: el ? el.offsetHeight : 0, top: el ? parseFloat(getComputedStyle(el).scrollMarginTop) || 0 : 0 };
  }, []);

  const begin = useCallback(
    (x: number, y: number, t: number, slop: number = PIT_SLOP) => {
      const el = drawer.current;
      if (!el || drag.current) return false;
      const f = frame();
      const cur = live.current;
      const options = cur.snap === "closed" ? pitDetents(cur.detents, f.view) : cur.snaps;
      if (cur.snap === "closed") decided.current = options;
      const from = translateOf(el) ?? pitStop(cur.snap, f);
      drag.current = { startY: y, startX: x, from, y: from, moved: false, slop, frame: f, snaps: options, samples: [{ t, y }] };
      return true;
    },
    [frame],
  );

  const write = (y: number) => {
    const el = drawer.current;
    const g = drag.current;
    if (!el || !g) return;
    el.style.transform = "translate3d(0," + y + "px,0)";
    const full = pitStop("full", g.frame);
    if (scrim.current) scrim.current.style.opacity = String(full < 0 ? Math.max(0, Math.min(1, y / full)) : 1);
  };

  const track = useCallback((x: number, y: number, t: number): "wait" | "drag" | "drop" => {
    const g = drag.current;
    const el = drawer.current;
    if (!g || !el) return "drop";
    if (!g.moved) {
      const dy = y - g.startY;
      const dx = x - g.startX;
      if (Math.abs(dy) < g.slop && Math.abs(dx) < g.slop) return "wait";
      if (Math.abs(dx) > Math.abs(dy)) {
        drag.current = null;
        return "drop";
      }
      g.moved = true;
      el.style.transition = "none";
      setDragging(true);
    }
    g.y = pitRubber(g.from + (y - g.startY), g.frame);
    g.samples.push({ t, y });
    if (g.samples.length > 12) g.samples.shift();
    write(g.y);
    return "drag";
  }, []);

  const release = useCallback((t: number, cancelled: boolean) => {
    const g = drag.current;
    drag.current = null;
    const el = drawer.current;
    if (!g || !g.moved || !el) return;
    const next = pitSettle(g.y, cancelled ? 0 : velocityOf(g.samples, t), g.frame, g.snaps);
    el.style.transition = "";
    el.style.transform = "";
    if (!el.getAttribute("style")) el.removeAttribute("style");
    const s = scrim.current;
    if (s) {
      s.style.opacity = "";
      if (!s.getAttribute("style")) s.removeAttribute("style");
    }
    el.setAttribute("data-snap", next);
    setDragging(false);
    if (next !== live.current.snap) live.current.onSnapChange(next);
  }, []);

  const onPointerDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 || ev.isPrimary === false) return;
    const target = ev.target as HTMLElement;
    if (body.current?.contains(target) || selecting(target)) return;
    if (ev.pointerType === "mouse" && target.closest("textarea, input")) return;
    if (!begin(ev.clientX, ev.clientY, ev.timeStamp, ev.pointerType === "touch" ? PIT_TOUCH_SLOP : PIT_SLOP)) return;
    const id = ev.pointerId;
    const el = ev.currentTarget;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const was = drag.current?.moved;
      const r = track(e.clientX, e.clientY, e.timeStamp);
      if (r === "drop") stop();
      else if (r === "drag" && !was) el.setPointerCapture?.(id);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const moved = drag.current?.moved;
      stop();
      if (moved && e.type === "pointerup") swallowClick();
      release(e.timeStamp, e.type !== "pointerup");
    };
    const stop = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
  };

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let scrolled = 0;
    let armed = false;
    let taken = false;
    const onScroll = () => {
      scrolled = performance.now();
    };
    const start = (ev: TouchEvent) => {
      const p = ev.touches[0];
      armed = ev.touches.length === 1 && !!p && el.scrollTop <= 0 && performance.now() - scrolled > PIT_SCROLL_GUARD_MS && begin(p.clientX, p.clientY, ev.timeStamp);
      taken = false;
    };
    const move = (ev: TouchEvent) => {
      if (!armed) return;
      const p = ev.touches[0];
      const g = drag.current;
      if (!p || !g) return;
      if (!g.moved && p.clientY < g.startY - PIT_SLOP / 2) {
        drag.current = null;
        armed = false;
        return;
      }
      const r = track(p.clientX, p.clientY, ev.timeStamp);
      if (r === "drop") armed = false;
      else if (r === "drag") {
        taken = true;
        if (ev.cancelable) ev.preventDefault();
      }
    };
    const end = (ev: TouchEvent) => {
      if (!armed) return;
      armed = false;
      if (taken) release(ev.timeStamp, ev.type === "touchcancel");
      else drag.current = null;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [mounted, begin, track, release]);

  const set = (next: PitSnap) => {
    if (next !== snap) onSnapChange(next);
  };
  const close = () => set("closed");
  const toggle = () => {
    if (snap !== "closed") return close();
    const options = pitDetents(detents, viewportHeight());
    decided.current = options;
    set(options[1] ?? "closed");
  };
  const onKnobKey = (ev: KeyboardEvent<HTMLButtonElement>) => {
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
    ev.preventDefault();
    set(pitStep(snap, ev.key === "ArrowUp" ? 1 : -1, snaps));
  };

  useDialog(drawer, close, { active: snap !== "closed", trap: !side, bodySelector: ".zr-pit-body", autofocus: () => !drawer.current?.querySelector(".zr-pit-head")?.contains(document.activeElement) });

  const touch = useRef<{ id: number; x: number; y: number } | null>(null);
  const tapped = useRef(false);
  const keepTyping = (ev: { preventDefault(): void }) => {
    if (drawer.current?.querySelector(".zr-pit-head")?.contains(document.activeElement)) ev.preventDefault();
  };

  const leave = leaving ? { "data-leaving": "" } : {};
  return (
    <>
      {!side && mounted && <div ref={scrim} className="zr-scrim zr-pit-scrim" onClick={close} {...leave} />}
      <div
        ref={drawer}
        className={["zr-pit", className].filter(Boolean).join(" ")}
        role={open ? "dialog" : undefined}
        aria-modal={open ? (side ? "false" : "true") : undefined}
        aria-label={open ? label : undefined}
        data-snap={snap}
        data-open={snap !== "closed" ? "" : undefined}
        data-dragging={dragging ? "" : undefined}
        data-docked={side ? "" : undefined}
        data-head={head ? "" : undefined}
        onPointerDown={onPointerDown}
        {...data}
      >
        <button
          type="button"
          className="zr-pit-knob"
          data-testid="pit-grip"
          aria-label={snap === "closed" ? knobLabel : closeLabel}
          aria-haspopup="dialog"
          aria-expanded={snap !== "closed"}
          onKeyDown={onKnobKey}
          onPointerDown={(ev) => {
            keepTyping(ev);
            tapped.current = false;
            touch.current = ev.pointerType === "touch" ? { id: ev.pointerId, x: ev.clientX, y: ev.clientY } : null;
          }}
          onPointerUp={(ev) => {
            const t = touch.current;
            touch.current = null;
            if (!t || t.id !== ev.pointerId || Math.hypot(ev.clientX - t.x, ev.clientY - t.y) >= PIT_SLOP) return;
            tapped.current = true;
            toggle();
          }}
          onTouchEnd={(ev) => {
            if (tapped.current && ev.cancelable) ev.preventDefault();
            tapped.current = false;
          }}
          onMouseDown={keepTyping}
          onClick={toggle}
        >
          <span className="zr-pit-knob-bar" aria-hidden="true" />
        </button>
        {head && <div className="zr-pit-head">{head}</div>}
        {mounted && (
          <div ref={body} className="zr-pit-body" {...leave}>
            {open ? children : last.current}
            {open && (
              <button type="button" className="zr-pit-close" onClick={close}>
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
