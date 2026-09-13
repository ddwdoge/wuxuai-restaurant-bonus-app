import {
  Children,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { carouselScrollEndTolerance, resolveCarouselActiveIndex } from "./carouselActiveIndex.mjs";
import { createImageCardPointerGuard } from "./imageCardPointerGuard.mjs";
import { useI18n } from "../../../shared/i18n/I18nProvider";
import { customerPresentationText } from "../customerRewardPresentation.mjs";
import "./premium-horizontal-carousel.css";

type PremiumHorizontalCarouselProps = {
  children: ReactNode;
  label: string;
  nextLabel?: string;
  previousLabel?: string;
};

export function PremiumHorizontalCarousel({
  children,
  label,
  nextLabel: suppliedNextLabel,
  previousLabel: suppliedPreviousLabel,
}: PremiumHorizontalCarouselProps) {
  const { language } = useI18n();
  const nextLabel = suppliedNextLabel ?? customerPresentationText("nextReward", language);
  const previousLabel = suppliedPreviousLabel ?? customerPresentationText("previousReward", language);
  const items = Children.toArray(children);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef<{
    arrived: boolean;
    clientWidth: number;
    index: number;
    itemWidth: number;
    scrollLeft: number;
    scrollWidth: number;
  } | null>(null);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageCardPointerGuard] = useState(createImageCardPointerGuard);
  const hasMultipleItems = items.length > 1;

  const updateActiveIndex = useCallback((viewport: HTMLDivElement) => {
    const itemElements = Array.from(viewport.querySelectorAll<HTMLElement>("[data-carousel-item]"));
    if (!itemElements.length) return;
    const viewportLeft = viewport.getBoundingClientRect().left;
    let programmaticScroll = programmaticScrollRef.current;
    const tolerance = carouselScrollEndTolerance(window.devicePixelRatio);
    if (programmaticScroll?.arrived
      && Math.abs(viewport.scrollLeft - programmaticScroll.scrollLeft) > tolerance) {
      programmaticScrollRef.current = null;
      programmaticScroll = null;
    }
    const nextIndex = resolveCarouselActiveIndex({
      clientWidth: viewport.clientWidth,
      devicePixelRatio: window.devicePixelRatio,
      itemStartDistances: itemElements.map((item) => item.getBoundingClientRect().left - viewportLeft),
      preferredIndex: programmaticScroll?.index,
      scrollLeft: viewport.scrollLeft,
      scrollWidth: viewport.scrollWidth,
    });
    if (programmaticScroll && !programmaticScroll.arrived
      && Math.abs(viewport.scrollLeft - programmaticScroll.scrollLeft) <= tolerance) {
      programmaticScroll.arrived = true;
      if (programmaticScrollFrameRef.current != null) {
        window.cancelAnimationFrame(programmaticScrollFrameRef.current);
        programmaticScrollFrameRef.current = null;
      }
    }
    setActiveIndex(nextIndex);
  }, []);

  const scrollToIndex = useCallback((nextIndex: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const itemElements = Array.from(viewport.querySelectorAll<HTMLElement>("[data-carousel-item]"));
    const targetIndex = Math.min(Math.max(nextIndex, 0), itemElements.length - 1);
    const target = itemElements[targetIndex];
    if (!target) return;
    const requestedLeft = target.getBoundingClientRect().left - viewport.getBoundingClientRect().left
      + viewport.scrollLeft - viewport.clientLeft;
    const targetLeft = Math.min(Math.max(requestedLeft, 0), viewport.scrollWidth - viewport.clientWidth);
    const tolerance = carouselScrollEndTolerance(window.devicePixelRatio);
    if (programmaticScrollFrameRef.current != null) window.cancelAnimationFrame(programmaticScrollFrameRef.current);
    const alreadyAtTarget = Math.abs(viewport.scrollLeft - targetLeft) <= tolerance;
    programmaticScrollRef.current = {
      arrived: alreadyAtTarget,
      clientWidth: viewport.clientWidth,
      index: targetIndex,
      itemWidth: target.getBoundingClientRect().width,
      scrollLeft: targetLeft,
      scrollWidth: viewport.scrollWidth,
    };
    if (!alreadyAtTarget) {
      let lastScrollLeft = viewport.scrollLeft;
      let hasMoved = false;
      let stableFrames = 0;
      const finishWhenStable = () => {
        if (!programmaticScrollRef.current || programmaticScrollRef.current.arrived) return;
        const movement = Math.abs(viewport.scrollLeft - lastScrollLeft);
        if (movement > tolerance / 2) hasMoved = true;
        stableFrames = hasMoved && movement <= tolerance / 2 ? stableFrames + 1 : 0;
        lastScrollLeft = viewport.scrollLeft;
        if (stableFrames >= 3) {
          programmaticScrollRef.current = null;
          programmaticScrollFrameRef.current = null;
          updateActiveIndex(viewport);
          return;
        }
        programmaticScrollFrameRef.current = window.requestAnimationFrame(finishWhenStable);
      };
      programmaticScrollFrameRef.current = window.requestAnimationFrame(finishWhenStable);
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollTo({ left: targetLeft, behavior: reducedMotion ? "instant" : "smooth" });
    setActiveIndex(targetIndex);
  }, [updateActiveIndex]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    if (animationFrameRef.current != null) window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = window.requestAnimationFrame(() => updateActiveIndex(viewport));
  }, [updateActiveIndex]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    scrollToIndex(activeIndex + (event.key === "ArrowRight" ? 1 : -1));
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    setActiveIndex(0);
    viewportRef.current?.scrollTo({ left: 0 });
  }, [items.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const programmaticScroll = programmaticScrollRef.current;
      const firstItem = viewport.querySelector<HTMLElement>("[data-carousel-item]");
      const itemWidth = firstItem?.getBoundingClientRect().width ?? 0;
      const tolerance = carouselScrollEndTolerance(window.devicePixelRatio);
      if (programmaticScroll && (programmaticScroll.clientWidth !== viewport.clientWidth
        || programmaticScroll.scrollWidth !== viewport.scrollWidth
        || Math.abs(programmaticScroll.itemWidth - itemWidth) > tolerance)) {
        programmaticScrollRef.current = null;
      }
      updateActiveIndex(viewport);
    });
    observer.observe(viewport);
    viewport.querySelectorAll<HTMLElement>("[data-carousel-item]").forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [items.length, updateActiveIndex]);

  useEffect(() => () => {
    if (animationFrameRef.current != null) window.cancelAnimationFrame(animationFrameRef.current);
    if (programmaticScrollFrameRef.current != null) window.cancelAnimationFrame(programmaticScrollFrameRef.current);
  }, []);

  if (!items.length) return null;

  return (
    <div className={`premium-horizontal-carousel${hasMultipleItems ? " is-multiple" : " is-single"}`}>
      <div
        aria-label={label}
        className="premium-horizontal-carousel-viewport"
        {...imageCardPointerGuard}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        ref={viewportRef}
        role="region"
        tabIndex={hasMultipleItems ? 0 : -1}
      >
        {items.map((item, index) => (
          <div
            aria-label={customerPresentationText("position", language, { current: index + 1, total: items.length })}
            aria-current={index === activeIndex ? "true" : undefined}
            className="premium-horizontal-carousel-item"
            data-carousel-item
            data-carousel-active={index === activeIndex ? "true" : undefined}
            key={(item as { key?: string | null }).key ?? index}
            role="group"
          >
            {item}
          </div>
        ))}
      </div>
      {hasMultipleItems ? (
        <div className="premium-horizontal-carousel-controls">
          <button
            aria-label={previousLabel}
            disabled={activeIndex === 0}
            onClick={() => scrollToIndex(activeIndex - 1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <span aria-live="polite" className="premium-horizontal-carousel-position">
            <strong>{activeIndex + 1}</strong> / {items.length}
          </span>
          <button
            aria-label={nextLabel}
            disabled={activeIndex === items.length - 1}
            onClick={() => scrollToIndex(activeIndex + 1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
