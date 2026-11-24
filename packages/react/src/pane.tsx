import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useDialog } from "./dialog";
import { EASE, EXIT_MS, reducedMotion } from "./motion";
import { usePaneEdge } from "./pane-edge";
import { rootVar } from "./rootvars";

export type PaneForm = "docked" | "drawer" | "sheet";

export interface PaneProps {
  readonly id: string;
  readonly label: string;
  readonly open: boolean;
  readonly width: number;
  readonly onWidth: (width: number) => void;
  readonly onClose?: () => void;
  readonly onOpen?: () => void;
  readonly side?: "left" | "right";
  readonly form?: PaneForm;
  readonly min?: number;
  readonly max?: number;
  readonly as?: "aside" | "nav";
  readonly className?: string;
  readonly children: ReactNode;
}

const STEP = 16;
const SWIPE = 60;
const COLLAPSE_SLACK = 40;
const SLIDE_PX = 24;

export const PANE_WIDTH_VAR = { left: "--zr-pane-w", right: "--zr-pane-right-w" } as const;

function coarse(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

export function Pane({ id, label, open, width, onWidth, onClose, onOpen, side = "left", form = "docked", min = 160, max = 640, as: Tag = "aside", className, children }: PaneProps) {
  const ref = useRef<HTMLElement | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, Math.round(w))), [min, max]);
  const docked = form === "docked";
  const varName = PANE_WIDTH_VAR[side];
  const [leaving, setLeaving] = useState(false);
  const dragging = useRef(false);
  const lastOpen = useRef(open);
  const was = useRef({ open, width: clamp(width) });
  const shown = open || leaving;
  const applied = docked ? (shown ? clamp(width) : 0) : null;
  const edgeOn = docked && side === "left" && !open && !!onOpen;
  const edge = usePaneEdge(ref, edgeOn, clamp(width), onOpen);
  const away = side === "left" ? -SLIDE_PX : SLIDE_PX;
  useLayoutEffect(() => {
    const el = ref.current;
    const sibling = side === "left" ? el?.nextElementSibling : el?.previousElementSibling;
    const before = { pane: el?.getBoundingClientRect(), sibling: sibling?.getBoundingClientRect() };
    rootVar(varName, applied === null ? null : applied + "px");
    const prior = was.current;
    const byHand = edge.arrived.current;
    edge.arrived.current = false;
    was.current = { open, width: clamp(width) };
    if (!el || !docked || reducedMotion() || typeof el.animate !== "function") return;
    const timing = { duration: EXIT_MS, easing: EASE };
    if (open && !prior.open) {
      if (!byHand) el.animate([{ opacity: 0, transform: "translateX(" + away + "px)" }, { opacity: 1, transform: "none" }], timing);
    } else if (open && !dragging.current && prior.width !== clamp(width) && before.pane && before.sibling && sibling) {
      const after = side === "left" ? sibling.getBoundingClientRect() : el.getBoundingClientRect();
      const dx = side === "left" ? after.left - before.sibling.left : after.left - before.pane.left;
      if (Math.abs(dx) > 0.5) (side === "left" ? sibling : el).animate([{ transform: "translateX(" + -dx + "px)" }, { transform: "none" }], timing);
    }
  }, [varName, docked, open, applied, width, clamp, side, away, edge.arrived]);
  useLayoutEffect(() => {
    const el = ref.current;
    const closing = lastOpen.current && !open;
    lastOpen.current = open;
    if (!docked || !closing || !el || reducedMotion() || typeof el.animate !== "function") return;
    setLeaving(true);
    const out = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(" + away + "px)" }], { duration: EXIT_MS, easing: EASE, fill: "forwards" });
    const done = () => setLeaving(false);
    out.finished.then(done, done);
    return () => out.cancel();
  }, [docked, open, away]);
  useEffect(() => () => rootVar(varName, null), [varName]);
  useDialog(ref, onClose ?? (() => {}), { active: !docked && open && !!onClose, typing: false, root: coarse() });
  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = { x: e.clientX, w: ref.current!.getBoundingClientRect().width };
    const target = e.currentTarget;
    dragging.current = true;
    target.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      const raw = start.w + (side === "left" ? m.clientX - start.x : start.x - m.clientX);
      if (raw < min - COLLAPSE_SLACK && onClose) onClose();
      else onWidth(clamp(raw));
    };
    const done = () => {
      dragging.current = false;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", done);
      target.removeEventListener("pointercancel", done);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", done);
    target.addEventListener("pointercancel", done);
  };
  const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
  const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && onClose) {
      e.preventDefault();
      onClose();
      return;
    }
    const next = e.key === shrink ? width - STEP : e.key === grow ? width + STEP : e.key === "Home" ? min : e.key === "End" ? max : null;
    if (next === null) return;
    e.preventDefault();
    onWidth(clamp(next));
  };
  const down = (e: ReactPointerEvent<HTMLElement>) => {
    swipe.current = !docked && open ? { x: e.clientX, y: e.clientY } : null;
  };
  const up = (e: ReactPointerEvent<HTMLElement>) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from || !onClose) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    const across = Math.abs(dx) > SWIPE && Math.abs(dx) > 2 * Math.abs(dy);
    const downward = dy > SWIPE && dy > 2 * Math.abs(dx);
    if ((form === "drawer" && across && (side === "left" ? dx < 0 : dx > 0)) || (form === "sheet" && downward)) onClose();
  };
  const follow = (e: ReactMouseEvent<HTMLElement>) => {
    if (form === "drawer" && onClose && (e.target as Element).closest("a[href]")) onClose();
  };
  return (
    <>
      <Tag
        ref={ref as never}
        id={id}
        className={"zr-pane" + (className ? " " + className : "")}
        aria-label={label}
        role={docked ? undefined : "dialog"}
        aria-modal={!docked && open ? true : undefined}
        tabIndex={docked ? undefined : -1}
        data-side={side}
        data-form={form}
        data-open={open ? "" : undefined}
        data-leaving={leaving && !open ? "" : undefined}
        data-peek={edge.peek ? "" : undefined}
        inert={!open}
        onPointerDown={down}
        onPointerUp={up}
        onClick={follow}
      >
        {children}
        {docked && <div className="zr-pane-grip" role="separator" aria-orientation="vertical" aria-label={"Resize " + label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={clamp(width)} tabIndex={0} onPointerDown={drag} onKeyDown={key} />}
      </Tag>
      {edgeOn && <div className="zr-pane-edge" aria-hidden="true" {...edge.zone} />}
    </>
  );
}
