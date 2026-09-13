export type CustomerRewardPresentationInput = {
  title?: string | null;
  category?: string | null;
  product_group?: string | null;
};
export function customerPresentationText(key: string, language: string, parameters?: Record<string, string | number>): string;
export function customerRewardPresentation(reward: CustomerRewardPresentationInput, language: string): {
  customSurprise: boolean;
  title: string;
  category: string | null;
};
