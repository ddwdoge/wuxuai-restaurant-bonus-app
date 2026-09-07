import type { ReactNode } from "react";

export type UiStatusTone = "neutral" | "success" | "warning" | "error" | "info";

export function UiStatus({
  children,
  className = "",
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: UiStatusTone;
}) {
  return <span className={`wux-status wux-status-${tone} ${className}`.trim()}>{children}</span>;
}
