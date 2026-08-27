import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  calculateMediaCoverScale,
  DEFAULT_MEDIA_ASPECT_RATIO,
  normalizeMediaPresentation,
  type MediaDimensions,
  type MediaPresentation,
} from "../mediaPresentation";
import "./smart-media.css";

type SmartMediaFrameProps = {
  alt: string;
  aspectRatio?: number;
  className?: string;
  fallback?: ReactNode;
  imageUrl?: string | null;
  onImageError?: () => void;
  onImageLoad?: (dimensions: MediaDimensions) => void;
  presentation?: Partial<MediaPresentation> | null;
};

export function SmartMediaFrame({
  alt,
  aspectRatio = DEFAULT_MEDIA_ASPECT_RATIO,
  className = "",
  fallback,
  imageUrl,
  onImageError,
  onImageLoad,
  presentation,
}: SmartMediaFrameProps) {
  const [coverScale, setCoverScale] = useState(1);
  const [failed, setFailed] = useState(false);
  const normalized = normalizeMediaPresentation(presentation);

  useEffect(() => {
    setFailed(false);
    setCoverScale(1);
  }, [imageUrl]);

  const style = {
    "--smart-media-aspect-ratio": aspectRatio,
    "--smart-media-position-x": `${normalized.positionX * 100}%`,
    "--smart-media-position-y": `${normalized.positionY * 100}%`,
    "--smart-media-render-scale": coverScale * normalized.zoom,
  } as CSSProperties;

  return (
    <div className={`smart-media-frame ${className}`.trim()} style={style}>
      {imageUrl && !failed ? (
        <img
          alt={alt}
          draggable={false}
          onError={() => {
            setFailed(true);
            onImageError?.();
          }}
          onLoad={(event) => {
            const dimensions = {
              height: event.currentTarget.naturalHeight,
              width: event.currentTarget.naturalWidth,
            };
            setCoverScale(calculateMediaCoverScale(dimensions.width, dimensions.height, aspectRatio));
            onImageLoad?.(dimensions);
          }}
          src={imageUrl}
        />
      ) : fallback}
    </div>
  );
}

