import { useRef, type ReactNode } from "react";
import { Button } from "./button";
import { useDialog } from "./dialog";
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

export function Sheet(props: SheetProps) {
  const last = useRef<ReactNode>(null);
  if (props.open) last.current = props.children;
  const { mounted, leaving } = useLinger(props.open);
  if (!mounted) return null;
  return <SheetPanel {...props} leaving={leaving}>{props.open ? props.children : last.current}</SheetPanel>;
}

function SheetPanel({ onClose, title, label, closeLabel = "Close", className, scrimClassName, data, leaving, children }: SheetProps & { leaving: boolean }) {
  const dialog = useRef<HTMLDivElement | null>(null);
  useDialog(dialog, onClose);

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
