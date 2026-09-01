import {
  calculateMediaCoverScale,
  calculateMediaFitZoom,
  DEFAULT_MEDIA_PRESENTATION,
  MAX_MEDIA_ZOOM,
  MIN_MEDIA_ZOOM,
  normalizeMediaPresentation,
  mediaPresentationFromRecord,
  type MediaPresentation,
} from "./mediaPresentation";

export type RewardImageCrop = MediaPresentation;

export const DEFAULT_REWARD_IMAGE_CROP = DEFAULT_MEDIA_PRESENTATION;

export const MIN_REWARD_IMAGE_ZOOM = MIN_MEDIA_ZOOM;
export const MAX_REWARD_IMAGE_ZOOM = MAX_MEDIA_ZOOM;
export const REWARD_IMAGE_ASPECT_RATIO = 16 / 9;

export function normalizeRewardImageCrop(input?: Partial<RewardImageCrop> | null): RewardImageCrop {
  return normalizeMediaPresentation(input);
}

export function calculateRewardImageFitZoom(width: number, height: number) {
  return calculateMediaFitZoom(width, height, REWARD_IMAGE_ASPECT_RATIO);
}

export function calculateRewardImageCoverScale(width: number, height: number) {
  return calculateMediaCoverScale(width, height, REWARD_IMAGE_ASPECT_RATIO);
}

export function rewardImageCropFromRecord(record?: {
  image_zoom?: number | null;
  image_position_x?: number | null;
  image_position_y?: number | null;
} | null) {
  return mediaPresentationFromRecord(record);
}
