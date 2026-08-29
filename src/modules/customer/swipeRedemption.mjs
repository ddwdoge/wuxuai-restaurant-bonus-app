export const swipeCompletionThreshold = 0.88;

export function clampSwipeProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

export function swipeCompletesRedemption(progress) {
  return clampSwipeProgress(progress) >= swipeCompletionThreshold;
}

