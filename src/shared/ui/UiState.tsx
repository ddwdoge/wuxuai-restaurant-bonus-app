import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";

type UiStateProps = {
  action?: ReactNode;
  description: string;
  kind: "loading" | "empty" | "error" | "unavailable";
  title: string;
};

export function UiState({ action, description, kind, title }: UiStateProps) {
  const Icon = kind === "loading" ? LoaderCircle : kind === "empty" ? Inbox : AlertCircle;
  return (
    <section aria-live={kind === "error" ? "assertive" : "polite"} className={`wux-state wux-state-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" className={kind === "loading" ? "wux-state-spinner" : undefined} size={24} />
      <div><h3>{title}</h3><p>{description}</p></div>
      {action}
    </section>
  );
}
