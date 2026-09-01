export type ReferralSharePayload = {
  title: string;
  text: string;
  url: string;
};

export function referralSharePayload(restaurantName: string, referralUrl: string): ReferralSharePayload;
export function supportsNativeReferralShare(navigatorLike: { share?: unknown } | null | undefined): boolean;

