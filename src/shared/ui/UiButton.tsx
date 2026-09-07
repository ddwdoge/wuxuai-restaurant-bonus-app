import type { ButtonHTMLAttributes, ReactNode } from "react";

export type UiButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";

type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  variant?: UiButtonVariant;
};

export function UiButton({ children, className = "", disabled, loading = false, variant = "primary", ...props }: UiButtonProps) {
  return (
    <button
      aria-busy={loading || undefined}
      className={`wux-button wux-button-${variant} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span aria-hidden="true" className="wux-spinner" /> : null}
      {children}
    </button>
  );
}
