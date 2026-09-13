export function carouselScrollEndTolerance(devicePixelRatio?: number): number;

export function resolveCarouselActiveIndex(input: {
  clientWidth: number;
  devicePixelRatio?: number;
  itemStartDistances: number[];
  preferredIndex?: number | null;
  scrollLeft: number;
  scrollWidth: number;
}): number;
