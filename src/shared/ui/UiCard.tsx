import type { HTMLAttributes, ReactNode } from "react";

export type UiCardVariant = "default" | "interactive" | "summary" | "warning" | "diagnostic" | "reward";

type UiCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  variant?: UiCardVariant;
};

export function UiCard({ children, className = "", variant = "default", ...props }: UiCardProps) {
  return <article className={`wux-card wux-card-${variant} ${className}`.trim()} {...props}>{children}</article>;
}
