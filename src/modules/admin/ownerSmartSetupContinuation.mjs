const SMART_SETUP_SOURCE = "owner-smart-setup-assistant";

const recommendationIds = new Set([
  "publication_email_unconfirmed",
  "publication_onboarding_incomplete",
  "publication_legal_readiness",
  "publication_restaurant_inactive",
  "publication_location_incomplete",
  "setup_points_redemption",
  "setup_first_offer",
  "setup_birthday_gift_pool",
  "setup_qr_center",
  "setup_staff_access",
]);

const successMessages = Object.freeze({
  location_saved: "Standort gespeichert.",
  reward_saved: "Punkteeinlösung erstellt.",
  offer_published: "Angebot veröffentlicht.",
  birthday_pool_saved: "Geburtstagsgeschenk eingerichtet.",
  staff_access_saved: "Mitarbeiterzugang eingerichtet.",
  legal_published: "Dokumente veröffentlicht.",
  onboarding_completed: "Einrichtung abgeschlossen.",
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function ownerSmartSetupLaunchState(recommendationId) {
  if (!recommendationIds.has(recommendationId)) return null;
  return { ownerSmartSetup: { source: SMART_SETUP_SOURCE, recommendationId } };
}

export function readOwnerSmartSetupLaunchState(state) {
  if (!isRecord(state) || !isRecord(state.ownerSmartSetup)) return null;
  const context = state.ownerSmartSetup;
  if (context.source !== SMART_SETUP_SOURCE || !recommendationIds.has(context.recommendationId)) return null;
  return { recommendationId: context.recommendationId };
}

export function ownerSmartSetupSuccessState(code) {
  if (!Object.hasOwn(successMessages, code)) return null;
  return { ownerSmartSetupSuccess: { source: SMART_SETUP_SOURCE, code } };
}

export function readOwnerSmartSetupSuccessState(state) {
  if (!isRecord(state) || !isRecord(state.ownerSmartSetupSuccess)) return null;
  const success = state.ownerSmartSetupSuccess;
  if (success.source !== SMART_SETUP_SOURCE || !Object.hasOwn(successMessages, success.code)) return null;
  return { code: success.code, message: successMessages[success.code] };
}
