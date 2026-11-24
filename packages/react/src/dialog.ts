import { useEffect, useRef, type RefObject } from "react";

export const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

export interface DialogOptions {
  active?: boolean;
  trap?: boolean;
  bodySelector?: string;
  typing?: boolean;
  root?: boolean;
}

function editable(t: EventTarget | null): boolean {
  const n = t as HTMLElement | null;
  return !!n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
}

export function useDialog(root: RefObject<HTMLElement | null>, onClose: () => void, options: DialogOptions = {}): void {
  const { active = true, trap = true, bodySelector = ".zr-sheet-body", typing = true, root: focusRoot = false } = options;
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    const el = root.current;
    const target = focusRoot ? el : el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(bodySelector + " " + FOCUSABLE) ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (!typing && editable(ev.target)) return;
        close.current();
        return;
      }
      if (!trap || ev.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const end = items[items.length - 1];
      if (!first || !end) return;
      if (!el.contains(document.activeElement)) {
        ev.preventDefault();
        first.focus();
      } else if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        end.focus();
      } else if (!ev.shiftKey && document.activeElement === end) {
        ev.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [active, trap, bodySelector, typing, focusRoot, root]);
}
