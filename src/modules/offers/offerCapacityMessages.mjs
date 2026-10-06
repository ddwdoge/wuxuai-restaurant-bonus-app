import { normalizeUiLanguage } from "../../shared/i18n/language.mjs";

export const OFFER_CAPACITY_REACHED_MESSAGES = Object.freeze({
  de: "Deine aktuelle Angebotskapazität ist erreicht. Deaktiviere ein aktives Angebot oder warte, bis zusätzliche Kapazität freigeschaltet ist.",
  en: "Your current offer capacity has been reached. Disable an active offer or wait until additional capacity is enabled.",
  fr: "Votre capacité actuelle d’offres est atteinte. Désactivez une offre active ou attendez que de la capacité supplémentaire soit disponible.",
  it: "Hai raggiunto la capacità attuale delle offerte. Disattiva un’offerta attiva o attendi che sia disponibile ulteriore capacità.",
  es: "Has alcanzado la capacidad actual de ofertas. Desactiva una oferta activa o espera a que se habilite capacidad adicional.",
  zh: "当前优惠容量已满。请停用一项有效优惠，或等待额外容量开放。",
  ko: "현재 혜택 등록 한도에 도달했습니다. 활성 혜택을 비활성화하거나 추가 용량이 제공될 때까지 기다려 주세요.",
});

export function offerCapacityReachedMessage(language) {
  const locale = normalizeUiLanguage(language, "de") || "de";
  return OFFER_CAPACITY_REACHED_MESSAGES[locale];
}
