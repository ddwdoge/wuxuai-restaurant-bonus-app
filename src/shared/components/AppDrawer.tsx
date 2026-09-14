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
  fitVisualViewport = false,
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
    let settleTimer = 0;
    let referenceWidth = Math.min(
      window.innerWidth,
      document.documentElement.clientWidth || window.innerWidth,
    );
    let referenceHeight = Math.max(
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
      viewport.height + Math.max(0, viewport.offsetTop),
    );

    // Mobile keyboards can shrink/pan the visual viewport without changing dvh.
    // iOS Safari can emit the first closing resize with stale geometry, so the
    // same values are sampled again on the next stable render and once after
    // the native keyboard animation has settled.
    const applyViewport = () => {
      const documentWidth = document.documentElement.clientWidth || window.innerWidth;
      const layoutWidth = Math.min(window.innerWidth, documentWidth);
      const currentLayoutHeight = Math.max(
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0,
        viewport.height + Math.max(0, viewport.offsetTop),
      );
      if (Math.abs(layoutWidth - referenceWidth) > 48) {
        referenceWidth = layoutWidth;
        referenceHeight = currentLayoutHeight;
      } else {
        referenceHeight = Math.max(referenceHeight, currentLayoutHeight);
      }
      const viewportWidth = Math.abs(viewport.scale - 1) < 0.01
        ? layoutWidth
        : Math.min(viewport.width, layoutWidth);
      overlay?.style.setProperty("--drawer-viewport-height", `${viewport.height}px`);
      overlay?.style.setProperty("--drawer-viewport-width", `${viewportWidth}px`);
      overlay?.style.setProperty("--drawer-viewport-left", `${viewport.offsetLeft}px`);
      overlay?.style.setProperty("--drawer-viewport-top", `${viewport.offsetTop}px`);

      const activeElement = document.activeElement;
      const activeTag = activeElement?.tagName?.toUpperCase();
      const excludedInputTypes = ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"];
      const activeInputType = activeElement?.getAttribute?.("type")?.toLowerCase() ?? "text";
      const isTextEntry = activeTag === "TEXTAREA"
        || Boolean(activeElement && "isContentEditable" in activeElement && activeElement.isContentEditable)
        || (activeTag === "INPUT" && !excludedInputTypes.includes(activeInputType));
      const keyboardThreshold = Math.max(120, referenceHeight * 0.18);
      const hasRealKeyboardReduction = referenceHeight - viewport.height >= keyboardThreshold;
      const mobileOwnerKeyboardOpen = Boolean(
        panel?.classList.contains("owner-mobile-drawer")
        && layoutWidth <= 767
        && Math.abs(viewport.scale - 1) < 0.01
        && activeElement
        && panel.contains(activeElement)
        && isTextEntry
        && hasRealKeyboardReduction,
      );
      if (mobileOwnerKeyboardOpen) {
        panel?.setAttribute("data-mobile-keyboard-open", "true");
      } else {
        panel?.removeAttribute("data-mobile-keyboard-open");
      }
    };

    const updateViewport = () => {
      applyViewport();
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      animationFrame = window.requestAnimationFrame(() => {
        applyViewport();
        animationFrame = window.requestAnimationFrame(() => {
          applyViewport();
          animationFrame = 0;
        });
      });
      settleTimer = window.setTimeout(() => {
        applyViewport();
        settleTimer = 0;
      }, 320);
    };

    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      overlay?.style.removeProperty("--drawer-viewport-height");
      overlay?.style.removeProperty("--drawer-viewport-width");
      overlay?.style.removeProperty("--drawer-viewport-left");
      overlay?.style.removeProperty("--drawer-viewport-top");
      panel?.removeAttribute("data-mobile-keyboard-open");
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
