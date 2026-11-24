import type { ReactNode } from "react";
import { Glyph } from "./ink";

export interface PitRowProps {
  glyph?: string;
  label: ReactNode;
  meta?: ReactNode;
  sub?: ReactNode;
  expanded?: boolean;
  detail?: ReactNode;
  depth?: number;
  current?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  id?: string;
  action?: string;
  className?: string;
  onClick: () => void;
}

export function PitRow({ glyph, label, meta, sub, expanded, detail, depth = 0, current, pressed, disabled, id, action, className, onClick }: PitRowProps) {
  return (
    <li className="zr-pit-li">
      <button
        type="button"
        className={["zr-pit-row", className].filter(Boolean).join(" ")}
        data-depth={Math.max(0, Math.min(6, depth))}
        data-id={id}
        data-action={action}
        aria-pressed={pressed}
        aria-expanded={expanded}
        aria-current={current ? "true" : undefined}
        disabled={disabled}
        onClick={onClick}
      >
        <Glyph glyph={current ? "▸" : (glyph ?? "")} className="zr-pit-row-glyph" />
        <span className="zr-pit-row-label">{label}</span>
        {meta !== undefined && meta !== "" && <span className="zr-pit-row-meta">{meta}</span>}
        {sub !== undefined && sub !== "" && <span className="zr-pit-row-sub">{sub}</span>}
      </button>
      {expanded && detail}
    </li>
  );
}

export function PitList({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul className="zr-pit-list" aria-label={label}>
      {children}
    </ul>
  );
}
