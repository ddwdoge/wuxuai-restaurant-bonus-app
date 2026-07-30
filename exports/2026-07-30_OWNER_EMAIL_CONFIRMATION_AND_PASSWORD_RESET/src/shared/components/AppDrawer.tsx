import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type AppDrawerProps = {
  children: ReactNode;
  description?: string;
  dismissOnOverlay?: boolean;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: "compact" | "standard" | "large";
  title: string;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AppDrawer({
  children,
  description,
  dismissOnOverlay = true,
  footer,
  onClose,
  open,
  size = "standard",
  title,
}: AppDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const preferredFocus = panelRef.current?.querySelector<HTMLElement>("[data-drawer-autofocus]");
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (preferredFocus ?? firstFocusable ?? panelRef.current)?.focus({ preventScroll: true });
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.offsetParent !== null);

      if (focusableElements.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="app-drawer-overlay"
      onClick={(event) => {
        if (dismissOnOverlay && event.target === event.currentTarget) closeRef.current();
      }}
      role="presentation"
    >
      <aside
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`app-drawer-panel app-drawer-${size}`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <span aria-hidden="true" className="app-drawer-handle" />
        <header className="app-drawer-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button aria-label="Ansicht schließen" className="app-drawer-close" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="app-drawer-body">{children}</div>
        {footer ? <footer className="app-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}
