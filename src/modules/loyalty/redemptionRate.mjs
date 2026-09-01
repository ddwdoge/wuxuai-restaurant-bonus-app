export const DEFAULT_REDEMPTION_RATE_PERCENT = 3;

export const REDEMPTION_RATE_PERCENT_OPTIONS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => index + 1),
);

export function isAllowedRedemptionRatePercent(value) {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

export function redemptionRateToPercent(value) {
  const percent = Number(value) * 100;
  return Number.isFinite(percent) ? Math.round(percent * 100) / 100 : null;
}

export function parseRewardRedemptionRate(description) {
  const match = String(description ?? "").match(/Einlösequote:\s*([0-9]+(?:[,.][0-9]+)?)\s*%/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function calculateRewardEconomics({ productPrice, redemptionRatePercent, pointsPerEuro }) {
  const price = Math.max(0, Number(productPrice) || 0);
  const ratePercent = Number(redemptionRatePercent);
  const pointRate = Math.max(0, Number(pointsPerEuro) || 0);

  if (!price || !isAllowedRedemptionRatePercent(ratePercent)) {
    return {
      estimatedConsumption: 0,
      requiredPoints: 0,
      status: "Quote auswählen",
      statusClass: "check",
    };
  }

  const estimatedConsumption = price / (ratePercent / 100);
  const requiredPoints = Math.max(0, Math.ceil(estimatedConsumption - pointRate));
  const consumptionRatio = estimatedConsumption / price;

  if (consumptionRatio >= 10) {
    return { estimatedConsumption, requiredPoints, status: "Wirtschaftlich", statusClass: "good" };
  }
  if (consumptionRatio >= 7) {
    return { estimatedConsumption, requiredPoints, status: "Bitte prüfen", statusClass: "check" };
  }
  return { estimatedConsumption, requiredPoints, status: "Sehr großzügig", statusClass: "risk" };
}
