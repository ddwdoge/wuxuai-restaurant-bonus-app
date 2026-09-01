export type OwnerDashboardRecommendation = {
  id: string;
  category: "critical" | "setup" | "action";
  icon: "publication" | "reward" | "offer" | "birthday" | "qr" | "staff" | "warning";
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref?: string;
};

export type OwnerDashboardRecommendationInput = {
  restaurantStatus: { active: boolean };
  onboardingStatus?: "draft" | "ready" | "completed";
  legalStatus: { status: "green" | "yellow" | "red"; reason?: string } | null;
  publicationStatus: { ready: boolean };
  rewardStatus: { pointsRedemptionReady: boolean; birthdayPoolReady: boolean };
  offerStatus: { ready: boolean };
  qrStatus: { ready: boolean };
  staffStatus: { ready: boolean };
  emailStatus: { confirmed: boolean };
  actionStatus?: { pointAnomalyOpen: boolean };
  statusLoadFailed: boolean;
};

export type OwnerSetupArea = {
  id: "restaurant_location" | "points_redemption" | "offer" | "birthday" | "qr" | "staff";
  ready: boolean;
};

export function resolveOwnerDashboardRecommendation(input: OwnerDashboardRecommendationInput): OwnerDashboardRecommendation | null;
export function resolveOwnerSetupAreas(input: OwnerDashboardRecommendationInput): ReadonlyArray<OwnerSetupArea>;
