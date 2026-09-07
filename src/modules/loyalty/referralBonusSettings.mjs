import { normalizeUiLanguage, UI_LOCALE_TAGS } from "../../shared/i18n/language.mjs";

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

const durationUnits = Object.freeze({
  de: Object.freeze({ day: "Tag", days: "Tage", hours: "Stunden" }),
  en: Object.freeze({ day: "day", days: "days", hours: "hours" }),
  fr: Object.freeze({ day: "jour", days: "jours", hours: "heures" }),
  it: Object.freeze({ day: "giorno", days: "giorni", hours: "ore" }),
  es: Object.freeze({ day: "día", days: "días", hours: "horas" }),
  zh: Object.freeze({ day: "天", days: "天", hours: "小时" }),
  ko: Object.freeze({ day: "일", days: "일", hours: "시간" }),
});

export function formatReferralDuration(durationDays, language = "de") {
  const locale = normalizeUiLanguage(language, "de");
  const units = durationUnits[locale];
  const hours = durationDays * 24;
  if (Number.isInteger(durationDays)) {
    return `${durationDays} ${durationDays === 1 ? units.day : units.days}`;
  }
  return `${hours.toLocaleString(UI_LOCALE_TAGS[locale])} ${units.hours}`;
}

export function formatInvitedReferralDuration(configuredDurationDays, language = "de") {
  return formatReferralDuration(invitedReferralDurationDays(configuredDurationDays), language);
}
