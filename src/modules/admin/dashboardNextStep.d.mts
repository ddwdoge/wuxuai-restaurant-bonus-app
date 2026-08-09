export type DashboardNextStep = {
  id: string;
  priority: number;
  category: "critical" | "setup" | "optimization" | "success";
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  dismissible: boolean;
};

export type DashboardNextStepInput = {
  restaurantStatus: { active: boolean };
  onboardingStatus?: "draft" | "ready" | "completed";
  legalStatus: { status: "green" | "yellow" | "red"; label?: string; reason?: string } | null;
  rewardStatus: { pointsRedemptionReady: boolean; welcomeGiftReady: boolean; birthdayPoolReady: boolean };
  qrStatus: { ready: boolean };
  pointsFlowStatus: { ready: boolean };
  emailStatus: { confirmed: boolean };
  profileStatus: { logoAvailable: boolean };
  referralStatus: { enabled: boolean };
  seenNoticeIds?: ReadonlySet<string>;
  persistenceAvailable: boolean;
  statusLoadFailed: boolean;
};

export const DASHBOARD_NOTICE_KEYS: Readonly<{
  onboardingSuccess: "legal_readiness_completed_v1";
  addLogo: "dashboard_add_logo_v1";
  enableReferral: "dashboard_enable_referral_v1";
}>;

export function resolveDashboardNextStep(input: DashboardNextStepInput): DashboardNextStep | null;
