import type { ComponentProps, ReactNode } from "react";

export type ButtonSize = "compact" | "default";
export type ButtonVariant = "outline" | "quiet" | "ghost" | "accent";

export interface ButtonProps extends Omit<ComponentProps<"button">, "type"> {
  size?: ButtonSize;
  variant?: ButtonVariant;
  type?: "button" | "submit";
}

export function Button({ size = "default", variant = "outline", type = "button", className, ...rest }: ButtonProps) {
  const cls = ["z2-control", "zr-btn", className].filter(Boolean).join(" ");
  return <button {...rest} type={type} className={cls} data-size={size} data-variant={variant} />;
}

export interface ButtonGroupProps {
  label?: string;
  className?: string;
  children: ReactNode;
}

export function ButtonGroup({ label, className, children }: ButtonGroupProps) {
  const cls = ["zr-group", className].filter(Boolean).join(" ");
  return (
    <div role="group" aria-label={label} className={cls}>
      {children}
    </div>
  );
}
