import type { ReactNode } from "react";
import { AppDrawer } from "../components/AppDrawer";

export type UiDialogSeverity = "normal" | "sensitive" | "critical";

type UiDialogProps = {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  severity?: UiDialogSeverity;
  title: string;
};

export function UiDialog({ children, description, footer, onClose, open, severity = "normal", title }: UiDialogProps) {
  return (
    <AppDrawer
      className={`wux-dialog wux-dialog-${severity}`}
      description={description}
      footer={footer}
      onClose={onClose}
      open={open}
      title={title}
    >
      {children}
    </AppDrawer>
  );
}
