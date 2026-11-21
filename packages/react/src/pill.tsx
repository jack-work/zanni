import type { ReactNode } from "react";

export interface PillSpec {
  glyph: string;
  label: string;
  title?: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick?: () => void;
}

export function Pill({ glyph, label, title, disabled, pressed, onClick, className, type = "button", children, ...rest }: PillSpec & { className?: string; type?: "button" | "submit"; children?: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <button type={type} className={["zr-pill", className].filter(Boolean).join(" ")} aria-label={label} title={title ?? label} disabled={disabled} aria-pressed={pressed} onClick={onClick} onMouseDown={(ev) => ev.preventDefault()} {...rest}>
      <span className="zr-pill-glyph" aria-hidden="true">
        {glyph}
      </span>
      {children}
    </button>
  );
}

export function PillPair({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="zr-pill-pair" role="group" aria-label={label}>
      {children}
    </div>
  );
}
