import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

type AppDrawerProps = {
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  description?: string;
  dismissOnEscape?: boolean;
  dismissOnOverlay?: boolean;
  footer?: ReactNode;
  fitVisualViewport?: boolean;
  onClose: () => void;
  open: boolean;
  size?: "compact" | "standard" | "large" | "workspace";
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
  className = "",
  closeLabel,
  description,
  dismissOnEscape = true,
  dismissOnOverlay = true,
  footer,
  fitVisualViewport = true,
  onClose,
  open,
  size = "standard",
  title,
}: AppDrawerProps) {
  const { translateKey: t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !fitVisualViewport || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    let animationFrame = 0;
    const settleTimers = new Set<number>();
    let recoveringAfterTextFocusExit = false;

    const isTextEntry = (element: EventTarget | null): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.isContentEditable) return true;
      if (element instanceof HTMLTextAreaElement) return true;
      if (!(element instanceof HTMLInputElement)) return false;
      return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(
        element.type.toLowerCase(),
      );
    };

    const clearSettleTimers = () => {
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      settleTimers.clear();
    };

    // Mobile keyboards can shrink/pan the visual viewport without changing dvh.
    // iOS Safari can finish dismissing the keyboard without a final usable
    // resize event. Keep the horizontal geometry CSS-owned and re-sample only
    // the vertical values for a bounded 500 ms after a text field loses focus.
    const applyViewport = (allowRecoveredLayoutFallback = false) => {
      const layoutHeight = Math.max(
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0,
      );
      const keyboardReductionThreshold = Math.max(120, layoutHeight * 0.18);
      const activeElement = document.activeElement;
      const hasTextFocusInPanel = Boolean(
        activeElement
        && panel?.contains(activeElement)
        && isTextEntry(activeElement),
      );
      const hasStaleKeyboardReduction = layoutHeight - viewport.height >= keyboardReductionThreshold;
      const useRecoveredLayout = Boolean(
        allowRecoveredLayoutFallback
        && recoveringAfterTextFocusExit
        && !hasTextFocusInPanel
        && hasStaleKeyboardReduction,
      );
      const viewportHeight = useRecoveredLayout ? layoutHeight : viewport.height;
      const maximumViewportTop = Math.max(0, layoutHeight - viewportHeight);
      const viewportTop = useRecoveredLayout
        ? 0
        : Math.min(Math.max(0, viewport.offsetTop), maximumViewportTop);

      overlay?.style.setProperty("--drawer-viewport-height", `${viewportHeight}px`);
      overlay?.style.setProperty("--drawer-viewport-top", `${viewportTop}px`);

      if (!hasStaleKeyboardReduction) recoveringAfterTextFocusExit = false;
    };

    const updateViewport = () => {
      applyViewport();
      window.cancelAnimationFrame(animationFrame);
      clearSettleTimers();
      animationFrame = window.requestAnimationFrame(() => {
        applyViewport();
        animationFrame = window.requestAnimationFrame(() => {
          applyViewport();
          animationFrame = 0;
        });
      });
      [100, 250, 500].forEach((delay) => {
        const timer = window.setTimeout(() => {
          settleTimers.delete(timer);
          applyViewport(delay === 500);
        }, delay);
        settleTimers.add(timer);
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (isTextEntry(event.target) && panel?.contains(event.target)) {
        recoveringAfterTextFocusExit = false;
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!isTextEntry(event.target) || !panel?.contains(event.target)) return;
      recoveringAfterTextFocusExit = true;
      updateViewport();
    };

    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.cancelAnimationFrame(animationFrame);
      clearSettleTimers();
      overlay?.style.removeProperty("--drawer-viewport-height");
      overlay?.style.removeProperty("--drawer-viewport-top");
    };
  }, [open, fitVisualViewport]);

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
      if (event.key === "Escape" && dismissOnEscape) {
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
  }, [dismissOnEscape, open]);

  if (!open) return null;

  return createPortal(
    <div
      className={`app-drawer-overlay app-drawer-overlay-${size}${fitVisualViewport ? " app-drawer-visual-viewport" : ""}`}
      ref={overlayRef}
      onClick={(event) => {
        if (dismissOnOverlay && event.target === event.currentTarget) closeRef.current();
      }}
      role="presentation"
    >
      <aside
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`app-drawer-panel app-drawer-${size}${className ? ` ${className}` : ""}`}
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
          <button aria-label={closeLabel ?? t("common.close")} className="app-drawer-close" onClick={onClose} type="button">
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
