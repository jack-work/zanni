import type { ReactNode } from "react";

export interface StripProps {
  kind: "running" | "note";
  text: string;
  time?: string;
  leaving?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Strip({ kind, text, time, leaving, className, children }: StripProps) {
  return (
    <div className={["zr-strip", className].filter(Boolean).join(" ")} data-kind={kind} {...(leaving ? { "data-leaving": "" } : {})}>
      {kind === "running" && (
        <span className="zr-glyph" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="zr-strip-text" role="status">
        {text}
      </span>
      {time !== undefined && (
        <span className="zr-strip-time" aria-hidden="true">
          {time}
        </span>
      )}
      {children}
    </div>
  );
}
