import { normalizeUiLanguage } from "../../shared/i18n/language.mjs";

export const OFFER_CAPACITY_REACHED_MESSAGES = Object.freeze({
  de: "Deine aktuelle Angebotskapazität ist erreicht. Buche +5 weitere Angebote für 19 € netto pro Monat.",
  en: "Your current offer capacity has been reached. Book +5 additional offers for €19 net per month.",
  fr: "Votre capacité actuelle d’offres est atteinte. Réservez 5 offres supplémentaires pour 19 € HT par mois.",
  it: "Hai raggiunto la capacità attuale delle offerte. Aggiungi 5 offerte per 19 € netti al mese.",
  es: "Has alcanzado la capacidad actual de ofertas. Añade 5 ofertas más por 19 € netos al mes.",
  zh: "你当前的优惠容量已满。每月净价 19 欧元可增加 5 个优惠。",
  ko: "현재 혜택 등록 한도에 도달했습니다. 월 순액 19유로로 혜택 5개를 추가하세요.",
});

export function offerCapacityReachedMessage(language) {
  const locale = normalizeUiLanguage(language, "de") || "de";
  return OFFER_CAPACITY_REACHED_MESSAGES[locale];
}
