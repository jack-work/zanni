import { createContext, memo, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Fit } from "./fit";
import { scrollRoot } from "./follow";
import { glyphs } from "./glyphs";
import { Plain } from "./text";

export type HeadMode = "shut" | "open" | "full";

export const DOUBLE_TAP_MS = 300;

export function tapMode(mode: HeadMode, sinceLast: number | null): HeadMode {
  if (mode === "shut") return "open";
  if (mode === "open" && sinceLast !== null && sinceLast < DOUBLE_TAP_MS) return "full";
  return "shut";
}

export function keyMode(mode: HeadMode, key: string): HeadMode {
  if (key === "Escape") return "shut";
  if (key === "F" && mode !== "shut") return mode === "full" ? "open" : "full";
  return mode;
}

export const Rule = memo(function Rule({ double }: { double: boolean }) {
  return <div className="zr-rule" {...(double ? { "data-double": "" } : {})} aria-hidden="true" />;
});

export const QuestionMark = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function usePinned(scope: RefObject<HTMLElement | null>, question: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>, text: string): boolean {
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const turn = scope.current;
    const block = question.current;
    const head = bar.current;
    if (!turn || !block || !head || typeof IntersectionObserver === "undefined") return;
    const root = scrollRoot();
    const scroller = root === document.documentElement || root === document.scrollingElement ? null : root;
    let above = false;
    let alive = false;
    const settle = () => setPinned(above && alive);
    const passed = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        above = !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds ? e.rootBounds.top : 0);
        settle();
      },
      { root: scroller, rootMargin: "-" + head.offsetHeight + "px 0px 0px 0px" },
    );
    const seen = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        alive = e.isIntersecting;
        settle();
      },
      { root: scroller },
    );
    passed.observe(block);
    seen.observe(turn);
    return () => {
      passed.disconnect();
      seen.disconnect();
    };
  }, [scope, question, bar, text]);
  return pinned;
}

export interface StickyProps {
  heading: ReactNode;
  tools?: ReactNode;
  text: string;
  className?: string;
  children: ReactNode;
}

export function Sticky({ heading, tools, text, className, children }: StickyProps) {
  const scope = useRef<HTMLDivElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const question = useRef<HTMLDivElement | null>(null);
  const tapper = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const lastTap = useRef<number | null>(null);
  const [mode, setMode] = useState<HeadMode>("shut");
  const pinned = usePinned(scope, question, bar, text);
  const id = useId();
  const has = text.trim() !== "";
  const shown = has ? mode : "shut";
  const open = shown !== "shut";
  const showText = has && pinned && !open;

  const tap = (e: MouseEvent) => {
    if (!has) return;
    const now = performance.now();
    const since = e.detail === 0 || lastTap.current === null ? null : now - lastTap.current;
    lastTap.current = now;
    setMode((m) => tapMode(m, since));
    tapper.current?.focus({ preventScroll: true });
  };

  const key = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape" || e.key === "F") {
      e.preventDefault();
      e.stopPropagation();
      setMode((m) => keyMode(m, e.key));
      return;
    }
    const lines = e.key === "j" ? 1 : e.key === "k" ? -1 : 0;
    const el = panel.current;
    if (lines && el) {
      e.preventDefault();
      el.scrollBy({ top: lines * (parseFloat(getComputedStyle(el).lineHeight) || 24) });
    }
  };

  return (
    <div ref={scope} className={["zr-sticky-scope", className].filter(Boolean).join(" ")}>
      <div className="zr-sticky" data-head={shown} {...(pinned ? { "data-pinned": "" } : {})} onKeyDown={key}>
        <div ref={bar} className="zr-sticky-bar">
          <button ref={tapper} type="button" className="zr-sticky-tap" disabled={!has} aria-expanded={open} aria-controls={id} onClick={tap}>
            <span className="zr-sticky-glyph" aria-hidden="true">
              {open ? glyphs["head.open"] : glyphs["head.shut"]}
            </span>
            {heading}
          </button>
          {tools}
        </div>
        <div className="zr-sticky-float">
          {showText && (
            <div className="zr-sticky-line" onClick={tap}>
              <Fit text={text} />
            </div>
          )}
          <div id={id} className="zr-sticky-panel" hidden={!open}>
            <div ref={panel} className="zr-sticky-scroll" tabIndex={open ? 0 : -1}>
              {open && <Plain text={text} />}
            </div>
          </div>
          <Rule double={pinned || open} />
        </div>
      </div>
      <QuestionMark value={question}>{children}</QuestionMark>
    </div>
  );
}
