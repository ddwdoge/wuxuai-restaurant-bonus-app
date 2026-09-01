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
  nextLabel = "Nächste Belohnung",
  previousLabel = "Vorherige Belohnung",
}: PremiumHorizontalCarouselProps) {
  const items = Children.toArray(children);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultipleItems = items.length > 1;

  const scrollToIndex = useCallback((nextIndex: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const itemElements = Array.from(viewport.querySelectorAll<HTMLElement>("[data-carousel-item]"));
    const targetIndex = Math.min(Math.max(nextIndex, 0), itemElements.length - 1);
    const target = itemElements[targetIndex];
    if (!target) return;
    viewport.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    setActiveIndex(targetIndex);
  }, []);

  const updateActiveIndex = useCallback((viewport: HTMLDivElement) => {
    const itemElements = Array.from(viewport.querySelectorAll<HTMLElement>("[data-carousel-item]"));
    if (!itemElements.length) return;
    const nearestIndex = itemElements.reduce((bestIndex, item, index) => (
      Math.abs(item.offsetLeft - viewport.scrollLeft)
        < Math.abs(itemElements[bestIndex].offsetLeft - viewport.scrollLeft)
        ? index
        : bestIndex
    ), 0);
    setActiveIndex(nearestIndex);
  }, []);

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

  useEffect(() => () => {
    if (animationFrameRef.current != null) window.cancelAnimationFrame(animationFrameRef.current);
  }, []);

  if (!items.length) return null;

  return (
    <div className={`premium-horizontal-carousel${hasMultipleItems ? " is-multiple" : " is-single"}`}>
      <div
        aria-label={label}
        className="premium-horizontal-carousel-viewport"
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        ref={viewportRef}
        role="region"
        tabIndex={hasMultipleItems ? 0 : -1}
      >
        {items.map((item, index) => (
          <div
            aria-label={`${index + 1} von ${items.length}`}
            className="premium-horizontal-carousel-item"
            data-carousel-item
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
