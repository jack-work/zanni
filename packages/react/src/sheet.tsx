import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { useLinger } from "./motion";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  label: string;
  closeLabel?: string;
  className?: string;
  scrimClassName?: string;
  data?: Record<`data-${string}`, string | undefined>;
  children: ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Sheet(props: SheetProps) {
  const last = useRef<ReactNode>(null);
  if (props.open) last.current = props.children;
  const { mounted, leaving } = useLinger(props.open);
  if (!mounted) return null;
  return <SheetPanel {...props} leaving={leaving}>{props.open ? props.children : last.current}</SheetPanel>;
}

function SheetPanel({ onClose, title, label, closeLabel = "Close", className, scrimClassName, data, leaving, children }: SheetProps & { leaving: boolean }) {
  const dialog = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = dialog.current;
    const target = root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(".zr-sheet-body " + FOCUSABLE) ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        close.current();
        return;
      }
      if (ev.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const end = items[items.length - 1];
      if (!first || !end) return;
      if (!root.contains(document.activeElement)) {
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
  }, []);

  const leave = leaving ? { "data-leaving": "" } : {};
  return (
    <>
      <div className={["zr-scrim", scrimClassName].filter(Boolean).join(" ")} onClick={() => onClose()} {...leave} />
      <div ref={dialog} className={["zr-sheet", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-label={label} {...data} {...leave}>
        <div className="zr-sheet-head">
          <span className="zr-sheet-title">{title}</span>
          <Button variant="quiet" size="compact" onClick={() => onClose()}>
            {closeLabel}
          </Button>
        </div>
        <div className="zr-sheet-body">{children}</div>
      </div>
    </>
  );
}
