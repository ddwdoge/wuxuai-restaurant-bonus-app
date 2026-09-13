const DEFAULT_SCROLL_END_TOLERANCE_PX = 2;

export function carouselScrollEndTolerance(devicePixelRatio = 1) {
  const normalizedDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  return Math.max(1, DEFAULT_SCROLL_END_TOLERANCE_PX / normalizedDpr);
}

export function resolveCarouselActiveIndex({
  clientWidth,
  devicePixelRatio = 1,
  itemStartDistances,
  scrollLeft,
  scrollWidth,
}) {
  if (!itemStartDistances.length) return -1;

  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const boundedScrollLeft = Math.min(Math.max(scrollLeft, 0), maxScrollLeft);
  const endDistance = maxScrollLeft - boundedScrollLeft;

  const endTolerance = carouselScrollEndTolerance(devicePixelRatio);
  if (maxScrollLeft > endTolerance && endDistance <= endTolerance) {
    return itemStartDistances.length - 1;
  }

  return itemStartDistances.reduce((bestIndex, distance, index) => (
    Math.abs(distance) < Math.abs(itemStartDistances[bestIndex]) ? index : bestIndex
  ), 0);
}
