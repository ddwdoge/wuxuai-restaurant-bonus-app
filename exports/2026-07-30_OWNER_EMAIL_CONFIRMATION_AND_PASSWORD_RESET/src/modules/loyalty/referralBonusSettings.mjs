export const referralBonusDurationPresets = [7, 14, 30, 60, 90];

export function isValidReferralBonusDuration(durationDays) {
  return Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= 365;
}

export function isReferralBonusDurationPreset(durationDays) {
  return referralBonusDurationPresets.includes(durationDays);
}
