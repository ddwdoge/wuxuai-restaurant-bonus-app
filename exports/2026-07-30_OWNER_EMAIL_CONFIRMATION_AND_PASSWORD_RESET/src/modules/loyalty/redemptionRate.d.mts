export const DEFAULT_REDEMPTION_RATE_PERCENT: 3;
export const REDEMPTION_RATE_PERCENT_OPTIONS: readonly number[];

export function isAllowedRedemptionRatePercent(value: number): boolean;
export function redemptionRateToPercent(value: number | null | undefined): number | null;
export function parseRewardRedemptionRate(description: string | null | undefined): number | null;
export function calculateRewardEconomics(input: {
  productPrice: number;
  redemptionRatePercent: number | null;
  pointsPerEuro: number;
}): {
  estimatedConsumption: number;
  requiredPoints: number;
  status: string;
  statusClass: "good" | "check" | "risk";
};
