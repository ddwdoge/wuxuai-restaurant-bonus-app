import type { ReactNode } from "react";
import type { RewardImageCrop } from "../rewardImageCrop";
import { SmartMediaFrame } from "./SmartMediaFrame";

type RewardImageFrameProps = {
  alt: string;
  className?: string;
  crop?: Partial<RewardImageCrop> | null;
  fallback?: ReactNode;
  imageUrl?: string | null;
  loading?: "eager" | "lazy";
  onImageLoad?: (dimensions: { height: number; width: number }) => void;
  renderScaleMode?: "contain" | "cover";
};

export function RewardImageFrame({ alt, className = "", crop, fallback, imageUrl, loading, onImageLoad, renderScaleMode }: RewardImageFrameProps) {
  return <SmartMediaFrame alt={alt} className={`reward-image-frame ${className}`.trim()} fallback={fallback} imageUrl={imageUrl} loading={loading} onImageLoad={onImageLoad} presentation={crop} renderScaleMode={renderScaleMode} />;
}
