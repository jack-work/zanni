import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Button } from "./button";
import { useDialog } from "./dialog";
import { reducedMotion, useLinger } from "./motion";
import { onViewportChange, viewportHeight } from "./viewport";

export type PitSnap = "closed" | "half" | "full";

export const PIT_FULL_ZONE = 0.15;
export const PIT_FLICK = 0.5;
export const PIT_SLOP = 6;
export const PIT_EXIT_MS = 420;
export const PIT_HEIGHT_VAR = "--zr-pit-h";

const ORDER: PitSnap[] = ["closed", "half", "full"];

export function pitHeight(snap: PitSnap, viewport: number): number {
  return snap === "closed" ? 0 : snap === "half" ? Math.round(viewport / 2) : viewport;
}

export function pitSettle(height: number, viewport: number, velocity: number): PitSnap {
  const stops = ORDER.map((s) => pitHeight(s, viewport));
  if (Math.abs(velocity) >= PIT_FLICK) {
    if (velocity > 0) return ORDER[stops.findIndex((s) => s > height + 1)] ?? "full";
    const below = stops.map((s, i) => (s < height - 1 ? i : -1)).filter((i) => i >= 0);
    return ORDER[below.length ? below[below.length - 1]! : 0]!;
  }
  if (height >= viewport * (1 - PIT_FULL_ZONE)) return "full";
  return height < viewport / 4 ? "closed" : "half";
}

export function pitStep(snap: PitSnap, direction: 1 | -1): PitSnap {
  const at = ORDER.indexOf(snap) + direction;
  return ORDER[Math.max(0, Math.min(ORDER.length - 1, at))]!;
}

interface Gesture {
  id: number;
  grip: boolean;
  startY: number;
  startHeight: number;
  height: number;
  moved: boolean;
  samples: { t: number; y: number }[];
}

interface PitState {
  snap: PitSnap;
  setSnap: (snap: PitSnap) => void;
  dragging: boolean;
  panel: { current: HTMLDivElement | null };
  grab: (grip: boolean) => GrabProps;
}

interface GrabProps {
  onPointerDown: (ev: PointerEvent<HTMLElement>) => void;
  onPointerMove: (ev: PointerEvent<HTMLElement>) => void;
  onPointerUp: (ev: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (ev: PointerEvent<HTMLElement>) => void;
}

const PitContext = createContext<PitState | null>(null);

export function usePit(): PitState | null {
  return useContext(PitContext);
}

function writeHeight(px: number): void {
  document.documentElement.style.setProperty(PIT_HEIGHT_VAR, Math.round(px) + "px");
}

function velocityOf(samples: Gesture["samples"], now: number): number {
  const recent = samples.filter((s) => now - s.t <= 100);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t - first.t < 8) return 0;
  return (first.y - last.y) / (last.t - first.t);
}

export interface PitProviderProps {
  snap?: PitSnap;
  defaultSnap?: PitSnap;
  onSnapChange?: (snap: PitSnap) => void;
  children: ReactNode;
}

export function PitProvider({ snap: controlled, defaultSnap = "closed", onSnapChange, children }: PitProviderProps) {
  const [own, setOwn] = useState<PitSnap>(defaultSnap);
  const snap = controlled ?? own;
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState(viewportHeight);
  const panel = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const live = useRef({ snap, viewport, onSnapChange });
  live.current = { snap, viewport, onSnapChange };

  const setSnap = useCallback((next: PitSnap) => {
    setOwn(next);
    live.current.onSnapChange?.(next);
  }, []);

  useEffect(() => {
    return onViewportChange(() => setViewport(viewportHeight()));
  }, []);

  useLayoutEffect(() => {
    if (dragging) return;
    if (snap === "closed") document.documentElement.style.removeProperty(PIT_HEIGHT_VAR);
    else writeHeight(pitHeight(snap, viewport));
  }, [snap, viewport, dragging]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(PIT_HEIGHT_VAR);
    },
    [],
  );

  const finish = useCallback(
    (ev: PointerEvent<HTMLElement>, cancelled: boolean) => {
      const g = gesture.current;
      if (!g || g.id !== ev.pointerId) return;
      gesture.current = null;
      if (ev.currentTarget.hasPointerCapture?.(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
      if (!g.moved) {
        if (g.grip && !cancelled) setSnap(live.current.snap === "closed" ? "half" : "closed");
        return;
      }
      const speed = cancelled ? 0 : velocityOf(g.samples, ev.timeStamp);
      setDragging(false);
      setSnap(pitSettle(g.height, live.current.viewport, speed));
    },
    [setSnap],
  );

  const grab = useCallback(
    (grip: boolean): GrabProps => ({
      onPointerDown: (ev) => {
        if (ev.button !== 0 || gesture.current) return;
        const target = ev.target as HTMLElement;
        if (target.closest("button:not([data-grab])")) return;
        ev.currentTarget.setPointerCapture?.(ev.pointerId);
        const start = panel.current ? panel.current.getBoundingClientRect().height : Math.max(0, live.current.viewport - ev.clientY);
        gesture.current = { id: ev.pointerId, grip, startY: ev.clientY, startHeight: start, height: start, moved: false, samples: [{ t: ev.timeStamp, y: ev.clientY }] };
      },
      onPointerMove: (ev) => {
        const g = gesture.current;
        if (!g || g.id !== ev.pointerId) return;
        const dy = g.startY - ev.clientY;
        if (!g.moved) {
          if (Math.abs(dy) < PIT_SLOP) return;
          g.moved = true;
          setDragging(true);
        }
        g.height = Math.max(0, Math.min(live.current.viewport, g.startHeight + dy));
        g.samples.push({ t: ev.timeStamp, y: ev.clientY });
        if (g.samples.length > 12) g.samples.shift();
        writeHeight(g.height);
      },
      onPointerUp: (ev) => finish(ev, false),
      onPointerCancel: (ev) => finish(ev, true),
    }),
    [finish],
  );

  const value = useMemo<PitState>(() => ({ snap, setSnap, dragging, panel, grab }), [snap, setSnap, dragging, grab]);
  return <PitContext.Provider value={value}>{children}</PitContext.Provider>;
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

function arrowKeys(pit: PitState) {
  return (ev: KeyboardEvent<HTMLElement>) => {
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
    ev.preventDefault();
    pit.setSnap(pitStep(pit.snap, ev.key === "ArrowUp" ? 1 : -1));
  };
}

export interface PitGripProps {
  label?: string;
  className?: string;
}

export function PitGrip({ label = "Open controls", className }: PitGripProps) {
  const pit = usePit();
  if (!pit) return null;
  return (
    <button
      type="button"
      data-grab=""
      className={["zr-grip", className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={pit.snap !== "closed"}
      data-snap={pit.snap}
      onKeyDown={arrowKeys(pit)}
      onClick={(ev) => {
        if (ev.detail === 0) pit.setSnap(pit.snap === "closed" ? "half" : "closed");
      }}
      {...pit.grab(true)}
    >
      <span className="zr-grip-bar" aria-hidden="true" />
    </button>
  );
}

export interface PitProps {
  title: ReactNode;
  label: string;
  glyph?: string;
  icon?: ReactNode;
  closeLabel?: string;
  resizeLabel?: string;
  docked?: boolean;
  className?: string;
  data?: Record<`data-${string}`, string | undefined>;
  children: ReactNode;
}

export function Pit({ title, label, glyph, icon, closeLabel = "Close", resizeLabel = "Resize", docked, className, data, children }: PitProps) {
  const pit = usePit();
  const wide = useWide();
  const side = docked ?? wide;
  const open = !!pit && (pit.snap !== "closed" || pit.dragging);
  const { mounted, leaving } = useLinger(open, PIT_EXIT_MS);
  const last = useRef<ReactNode>(null);
  if (open) last.current = children;
  if (!pit || !mounted) return null;
  return (
    <PitPanel pit={pit} title={title} label={label} glyph={glyph} icon={icon} closeLabel={closeLabel} resizeLabel={resizeLabel} docked={side} className={className} data={data} leaving={leaving && !reducedMotion()}>
      {open ? children : last.current}
    </PitPanel>
  );
}

function PitPanel({ pit, title, label, glyph, icon, closeLabel, resizeLabel, docked, className, data, leaving, children }: Omit<PitProps, "docked" | "closeLabel" | "resizeLabel"> & { pit: PitState; closeLabel: string; resizeLabel: string; docked: boolean; leaving: boolean }) {
  const close = () => pit.setSnap("closed");
  useDialog(pit.panel, close, { active: pit.snap !== "closed", trap: !docked, bodySelector: ".zr-pit-body" });
  const leave = leaving ? { "data-leaving": "" } : {};
  return (
    <>
      {!docked && <div className="zr-scrim zr-pit-scrim" onClick={close} {...leave} />}
      <div
        ref={pit.panel}
        className={["zr-pit", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal={docked ? "false" : "true"}
        aria-label={label}
        data-snap={pit.snap}
        data-docked={docked ? "" : undefined}
        data-dragging={pit.dragging ? "" : undefined}
        {...data}
        {...leave}
      >
        <div className="zr-pit-head" {...pit.grab(false)}>
          <button type="button" data-grab="" className="zr-pit-handle" aria-label={resizeLabel} onKeyDown={arrowKeys(pit)}>
            <span className="zr-grip-bar" aria-hidden="true" />
          </button>
          <div className="zr-pit-bar">
            <span className="zr-pit-title">
              {pit.snap === "full" && icon ? (
                <span className="zr-pit-icon" aria-hidden="true">
                  {icon}
                </span>
              ) : (
                glyph && (
                  <span className="zr-pit-glyph" aria-hidden="true">
                    {glyph}
                  </span>
                )
              )}
              {title}
            </span>
            <Button variant="quiet" size="compact" onClick={close}>
              {closeLabel}
            </Button>
          </div>
        </div>
        <div className="zr-pit-body">{children}</div>
      </div>
    </>
  );
}
