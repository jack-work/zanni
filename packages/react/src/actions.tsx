import type { ReactNode } from "react";

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={["zr-actionbar", className].filter(Boolean).join(" ")}>{children}</span>;
}
