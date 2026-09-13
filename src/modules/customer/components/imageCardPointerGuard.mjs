// Only distinguish a Home image-card tap from a pan. Opening stays on the
// existing native button's click handler; never open on pointerup/touchend.
export function createImageCardPointerGuard() {
  let gesture = null;
  const moved = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
      gesture.cancelled = true;
    }
  };

  return {
    onPointerDownCapture(event) {
      if (!event.currentTarget.closest(".customer-home-compact")) return;
      if (!event.isPrimary && gesture) {
        gesture.cancelled = true;
        return;
      }
      gesture = event.target.closest?.(".customer-image-first-action") ? {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollLeft: event.currentTarget.scrollLeft,
        cancelled: !event.isPrimary || event.button !== 0,
      } : null;
    },
    onPointerMoveCapture: moved,
    onPointerUpCapture: moved,
    onPointerCancelCapture() {
      if (gesture) gesture.cancelled = true;
    },
    onClickCapture(event) {
      const previous = gesture;
      gesture = null;
      // Keyboard/assistive activation has no pointer click count.
      if (event.detail === 0 || !previous) return;
      if (!event.target.closest?.(".customer-image-first-action")) return;
      if (previous.cancelled || Math.abs(event.currentTarget.scrollLeft - previous.scrollLeft) > 8) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
