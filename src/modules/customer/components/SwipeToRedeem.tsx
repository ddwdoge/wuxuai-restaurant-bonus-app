import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { clampSwipeProgress, swipeCompletesRedemption } from "../swipeRedemption.mjs";

type SwipeToRedeemProps = {
  disabled?: boolean;
  pending?: boolean;
  onConfirm: () => Promise<boolean>;
};

export function SwipeToRedeem({ disabled = false, pending = false, onConfirm }: SwipeToRedeemProps) {
  const [progress, setProgress] = useState(0);
  const [locked, setLocked] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!pending && !disabled && !lockedRef.current) setProgress(0);
  }, [disabled, pending]);

  function progressFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return 0;
    const bounds = track.getBoundingClientRect();
    const thumbWidth = Math.min(64, bounds.width * 0.2);
    const travel = Math.max(1, bounds.width - thumbWidth - 12);
    return clampSwipeProgress((clientX - bounds.left - thumbWidth / 2 - 6) / travel);
  }

  async function finish(nextProgress: number) {
    if (lockedRef.current || disabled || pending) return;
    if (!swipeCompletesRedemption(nextProgress)) {
      setProgress(0);
      return;
    }

    lockedRef.current = true;
    setLocked(true);
    setProgress(1);
    const confirmed = await onConfirm();
    if (!confirmed) {
      lockedRef.current = false;
      setLocked(false);
      setProgress(0);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || pending || lockedRef.current || event.button !== 0) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setProgress(progressFromClientX(event.clientX));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || disabled || pending || lockedRef.current) return;
    setProgress(progressFromClientX(event.clientX));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const nextProgress = progressFromClientX(event.clientX);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    void finish(nextProgress);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || pending || lockedRef.current) return;
    if (event.key === "Home" || event.key === "ArrowLeft") {
      event.preventDefault();
      setProgress((current) => event.key === "Home" ? 0 : clampSwipeProgress(current - 0.2));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setProgress((current) => clampSwipeProgress(current + 0.2));
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      void finish(1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && swipeCompletesRedemption(progress)) {
      event.preventDefault();
      void finish(progress);
    }
  }

  const isLocked = disabled || pending || locked;
  return (
    <div className="premium-swipe-confirmation">
      <div
        aria-disabled={isLocked}
        aria-label="Zum Einlösen wischen"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress * 100)}
        className={`premium-swipe-track${isLocked ? " is-locked" : ""}`}
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
      >
        <span className="premium-swipe-fill" style={{ width: `${Math.max(12, progress * 100)}%` }} />
        <span className="premium-swipe-label">
          {pending ? "Verbindung wird geprüft…" : "Zum Einlösen wischen"}
        </span>
        <span className="premium-swipe-thumb" style={{ left: `calc(${progress * 100}% - ${progress * 58}px)` }}>
          {pending ? <LoaderCircle aria-hidden="true" className="premium-swipe-spinner" size={26} /> : <ArrowRight aria-hidden="true" size={28} />}
        </span>
      </div>
      <p>Bitte jetzt vor dem Mitarbeiter von links nach rechts wischen.</p>
    </div>
  );
}
