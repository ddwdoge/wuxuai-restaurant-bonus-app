import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { RewardImageFrame } from "../../../shared/components/RewardImageFrame";
import type { RewardImageCrop } from "../../../shared/rewardImageCrop";

type PremiumOwnerRewardCardProps = {
  actions: ReactNode;
  badgeLabel: string;
  badgeTone: "active" | "inactive" | "draft" | "expired" | "redeemed";
  category: string;
  className?: string;
  description?: string;
  imageUrl?: string | null;
  imageCrop?: Partial<RewardImageCrop> | null;
  media?: ReactNode;
  meta: Array<{ label: string; value: string }>;
  PlaceholderIcon: LucideIcon;
  title: string;
};

export function PremiumOwnerRewardCard({
  actions,
  badgeLabel,
  badgeTone,
  category,
  className = "",
  description,
  imageUrl,
  imageCrop,
  media,
  meta,
  PlaceholderIcon,
  title,
}: PremiumOwnerRewardCardProps) {
  return (
    <article className={`premium-owner-reward-card ${className}`.trim()}>
      <div className="premium-owner-reward-media">
        {media ?? (imageUrl ? (
          <RewardImageFrame alt={title} crop={imageCrop} imageUrl={imageUrl} />
        ) : (
          <span className="premium-owner-reward-placeholder" aria-label={`Standardbild ${title}`}>
            <PlaceholderIcon aria-hidden="true" size={42} strokeWidth={1.5} />
          </span>
        ))}
        <span className={`premium-owner-status-badge ${badgeTone}`}>
          <span aria-hidden="true" />
          {badgeLabel}
        </span>
      </div>

      <div className="premium-owner-reward-content">
        <p className="premium-owner-reward-category">{category}</p>
        <h2>{title}</h2>
        {description ? <p className="premium-owner-reward-description">{description}</p> : null}
        <dl className="premium-owner-reward-meta">
          {meta.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="premium-owner-reward-actions">{actions}</div>
    </article>
  );
}
