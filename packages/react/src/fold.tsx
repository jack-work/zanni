import type { ComponentProps, ReactNode } from "react";

export interface FoldProps extends Omit<ComponentProps<"details">, "className"> {
  summary: ReactNode;
  className?: string;
}

export function Fold({ summary, className, children, ...rest }: FoldProps) {
  return (
    <details {...rest} className={[className, "zr-fold"].filter(Boolean).join(" ")}>
      <summary className="nodi-sum">
        <span className="nodi-caret" />
        {summary}
      </summary>
      {children}
    </details>
  );
}
