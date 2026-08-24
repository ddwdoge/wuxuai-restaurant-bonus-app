export const referralBonusMultiplier = 2;
export const referralBonusDefaultDurationDays = 14;
export const referralBonusDurationPresets = [7, 14, 28];
export const referralBonusMinDurationDays = 1;
export const referralBonusMaxDurationDays = 365;

export function isValidReferralBonusDuration(durationDays) {
  return Number.isInteger(durationDays)
    && durationDays >= referralBonusMinDurationDays
    && durationDays <= referralBonusMaxDurationDays;
}

export function isReferralBonusDurationPreset(durationDays) {
  return referralBonusDurationPresets.includes(durationDays);
}

export function normalizeReferralBonusDuration(durationDays) {
  const value = Number(durationDays ?? referralBonusDefaultDurationDays);
  return isValidReferralBonusDuration(value) ? value : referralBonusDefaultDurationDays;
}

export function invitedReferralDurationDays(configuredDurationDays) {
  return normalizeReferralBonusDuration(configuredDurationDays) / 2;
}

export function formatReferralDuration(durationDays) {
  const hours = durationDays * 24;
  if (Number.isInteger(durationDays)) {
    return `${durationDays} ${durationDays === 1 ? "Tag" : "Tage"}`;
  }
  return `${hours.toLocaleString("de-AT")} Stunden`;
}

export function formatInvitedReferralDuration(configuredDurationDays) {
  return formatReferralDuration(invitedReferralDurationDays(configuredDurationDays));
}
