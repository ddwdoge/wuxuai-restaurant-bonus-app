export type RewardImageCrop = {
  zoom: number;
  positionX: number;
  positionY: number;
};

export const DEFAULT_REWARD_IMAGE_CROP: RewardImageCrop = {
  zoom: 1,
  positionX: 0.5,
  positionY: 0.5,
};

export const MIN_REWARD_IMAGE_ZOOM = 0.1;
export const MAX_REWARD_IMAGE_ZOOM = 4;
export const REWARD_IMAGE_ASPECT_RATIO = 16 / 9;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeRewardImageCrop(input?: Partial<RewardImageCrop> | null): RewardImageCrop {
  return {
    zoom: clamp(Number(input?.zoom ?? 1), MIN_REWARD_IMAGE_ZOOM, MAX_REWARD_IMAGE_ZOOM),
    positionX: clamp(Number(input?.positionX ?? 0.5), 0, 1),
    positionY: clamp(Number(input?.positionY ?? 0.5), 0, 1),
  };
}

export function calculateRewardImageFitZoom(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const imageAspectRatio = width / height;
  return clamp(
    Math.min(1, imageAspectRatio / REWARD_IMAGE_ASPECT_RATIO, REWARD_IMAGE_ASPECT_RATIO / imageAspectRatio),
    MIN_REWARD_IMAGE_ZOOM,
    1,
  );
}

export function calculateRewardImageCoverScale(width: number, height: number) {
  return 1 / calculateRewardImageFitZoom(width, height);
}

export function rewardImageCropFromRecord(record?: {
  image_zoom?: number | null;
  image_position_x?: number | null;
  image_position_y?: number | null;
} | null) {
  return normalizeRewardImageCrop({
    zoom: record?.image_zoom ?? 1,
    positionX: record?.image_position_x ?? 0.5,
    positionY: record?.image_position_y ?? 0.5,
  });
}
