import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useDialog } from "./dialog";
import { rootVar } from "./rootvars";

export type PaneForm = "docked" | "drawer" | "sheet";

export interface PaneProps {
  readonly id: string;
  readonly label: string;
  readonly open: boolean;
  readonly width: number;
  readonly onWidth: (width: number) => void;
  readonly onClose?: () => void;
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

export const PANE_WIDTH_VAR = { left: "--zr-pane-w", right: "--zr-pane-right-w" } as const;

function coarse(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

export function Pane({ id, label, open, width, onWidth, onClose, side = "left", form = "docked", min = 160, max = 640, as: Tag = "aside", className, children }: PaneProps) {
  const ref = useRef<HTMLElement | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, Math.round(w))), [min, max]);
  const docked = form === "docked";
  const varName = PANE_WIDTH_VAR[side];
  useEffect(() => {
    rootVar(varName, docked ? (open ? clamp(width) : 0) + "px" : null);
    return () => rootVar(varName, null);
  }, [varName, docked, open, width, clamp]);
  useDialog(ref, onClose ?? (() => {}), { active: !docked && open && !!onClose, typing: false, root: coarse() });
  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = { x: e.clientX, w: ref.current!.getBoundingClientRect().width };
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      const raw = start.w + (side === "left" ? m.clientX - start.x : start.x - m.clientX);
      if (raw < min - COLLAPSE_SLACK && onClose) onClose();
      else onWidth(clamp(raw));
    };
    const done = () => {
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
      inert={!open}
      onPointerDown={down}
      onPointerUp={up}
      onClick={follow}
    >
      {children}
      {docked && <div className="zr-pane-grip" role="separator" aria-orientation="vertical" aria-label={"Resize " + label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={clamp(width)} tabIndex={0} onPointerDown={drag} onKeyDown={key} />}
    </Tag>
  );
}
