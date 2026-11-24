import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export interface PaneProps {
  readonly id: string;
  readonly label: string;
  readonly open: boolean;
  readonly width: number;
  readonly onWidth: (width: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly as?: "aside" | "nav";
  readonly className?: string;
  readonly children: ReactNode;
}

const STEP = 16;

let sheet: CSSStyleSheet | undefined;

function paneWidth(px: number | null): void {
  if (!document.adoptedStyleSheets) return;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(":root {}");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  const style = (sheet.cssRules[0] as CSSStyleRule).style;
  if (px === null) style.removeProperty("--zr-pane-w");
  else style.setProperty("--zr-pane-w", px + "px");
}

export function Pane({ id, label, open, width, onWidth, min = 160, max = 640, as: Tag = "aside", className, children }: PaneProps) {
  const ref = useRef<HTMLElement | null>(null);
  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, Math.round(w))), [min, max]);
  useEffect(() => {
    paneWidth(open ? clamp(width) : 0);
    return () => paneWidth(null);
  }, [open, width, clamp]);
  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const left = ref.current!.getBoundingClientRect().left;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => onWidth(clamp(m.clientX - left));
    const done = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", done);
      target.removeEventListener("pointercancel", done);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", done);
    target.addEventListener("pointercancel", done);
  };
  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = e.key === "ArrowLeft" ? width - STEP : e.key === "ArrowRight" ? width + STEP : e.key === "Home" ? min : e.key === "End" ? max : null;
    if (next === null) return;
    e.preventDefault();
    onWidth(clamp(next));
  };
  return (
    <Tag ref={ref as never} id={id} className={"zr-pane" + (className ? " " + className : "")} aria-label={label} data-open={open ? "" : undefined} inert={!open}>
      {children}
      <div className="zr-pane-grip" role="separator" aria-orientation="vertical" aria-label={"Resize " + label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={clamp(width)} tabIndex={0} onPointerDown={drag} onKeyDown={key} />
    </Tag>
  );
}
