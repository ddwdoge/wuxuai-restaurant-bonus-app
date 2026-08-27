export type MediaPresentation = {
  zoom: number;
  positionX: number;
  positionY: number;
};

export type MediaDimensions = {
  height: number;
  width: number;
};

export const DEFAULT_MEDIA_PRESENTATION: MediaPresentation = {
  zoom: 1,
  positionX: 0.5,
  positionY: 0.5,
};

export const DEFAULT_MEDIA_ASPECT_RATIO = 16 / 9;
export const MIN_MEDIA_ZOOM = 0.1;
export const MAX_MEDIA_ZOOM = 4;

export function clampMediaValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeMediaPresentation(
  input?: Partial<MediaPresentation> | null,
): MediaPresentation {
  return {
    zoom: clampMediaValue(Number(input?.zoom ?? 1), MIN_MEDIA_ZOOM, MAX_MEDIA_ZOOM),
    positionX: clampMediaValue(Number(input?.positionX ?? 0.5), 0, 1),
    positionY: clampMediaValue(Number(input?.positionY ?? 0.5), 0, 1),
  };
}

export function calculateMediaFitZoom(
  width: number,
  height: number,
  targetAspectRatio = DEFAULT_MEDIA_ASPECT_RATIO,
) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const imageAspectRatio = width / height;
  return clampMediaValue(
    Math.min(1, imageAspectRatio / targetAspectRatio, targetAspectRatio / imageAspectRatio),
    MIN_MEDIA_ZOOM,
    1,
  );
}

export function calculateMediaCoverScale(
  width: number,
  height: number,
  targetAspectRatio = DEFAULT_MEDIA_ASPECT_RATIO,
) {
  return 1 / calculateMediaFitZoom(width, height, targetAspectRatio);
}

export function mediaPresentationFromRecord(record?: {
  image_zoom?: number | null;
  image_position_x?: number | null;
  image_position_y?: number | null;
} | null) {
  return normalizeMediaPresentation({
    zoom: record?.image_zoom ?? 1,
    positionX: record?.image_position_x ?? 0.5,
    positionY: record?.image_position_y ?? 0.5,
  });
}

