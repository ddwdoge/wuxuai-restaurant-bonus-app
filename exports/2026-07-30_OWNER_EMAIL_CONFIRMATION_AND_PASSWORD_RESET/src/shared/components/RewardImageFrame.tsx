import { useState, type CSSProperties, type ReactNode } from "react";
import {
  calculateRewardImageCoverScale,
  normalizeRewardImageCrop,
  type RewardImageCrop,
} from "../rewardImageCrop";
import "./reward-image-frame.css";

type RewardImageFrameProps = {
  alt: string;
  className?: string;
  crop?: Partial<RewardImageCrop> | null;
  fallback?: ReactNode;
  imageUrl?: string | null;
  onImageLoad?: (dimensions: { height: number; width: number }) => void;
};

export function RewardImageFrame({ alt, className = "", crop, fallback, imageUrl, onImageLoad }: RewardImageFrameProps) {
  const [coverScale, setCoverScale] = useState(1);
  const normalized = normalizeRewardImageCrop(crop);
  const style = {
    "--reward-image-position-x": `${normalized.positionX * 100}%`,
    "--reward-image-position-y": `${normalized.positionY * 100}%`,
    "--reward-image-render-scale": coverScale * normalized.zoom,
  } as CSSProperties;

  return (
    <div className={`reward-image-frame ${className}`.trim()} style={style}>
      {imageUrl ? <img alt={alt} draggable={false} onLoad={(event) => { const dimensions = { height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth }; setCoverScale(calculateRewardImageCoverScale(dimensions.width, dimensions.height)); onImageLoad?.(dimensions); }} src={imageUrl} /> : fallback}
    </div>
  );
}
