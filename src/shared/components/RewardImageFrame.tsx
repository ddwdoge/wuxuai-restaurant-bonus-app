import type { ReactNode } from "react";
import type { RewardImageCrop } from "../rewardImageCrop";
import { SmartMediaFrame } from "./SmartMediaFrame";

type RewardImageFrameProps = {
  alt: string;
  className?: string;
  crop?: Partial<RewardImageCrop> | null;
  fallback?: ReactNode;
  imageUrl?: string | null;
  onImageLoad?: (dimensions: { height: number; width: number }) => void;
};

export function RewardImageFrame({ alt, className = "", crop, fallback, imageUrl, onImageLoad }: RewardImageFrameProps) {
  return <SmartMediaFrame alt={alt} className={`reward-image-frame ${className}`.trim()} fallback={fallback} imageUrl={imageUrl} onImageLoad={onImageLoad} presentation={crop} />;
}
