import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  legalPublicationErrorMessage,
  resolveOwnerLegalReadiness,
  validateLegalPublication,
} from "../src/modules/legal/ownerLegalReadiness.mjs";

const ownerPage = await readFile(new URL("../src/modules/legal/OwnerLegalSettingsPage.tsx", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const ownerStyles = await readFile(new URL("../src/modules/admin/admin-premium.css", import.meta.url), "utf8");

function registration(overrides = {}) {
  return {
    status: "red",
    label: "Kundenregistrierung blockiert",
    reason: "Teilnahmebedingungen oder Datenschutzerklärung sind nicht aktiv.",
    registration_allowed: false,
    last_updated_at: null,
    missing_profile_fields: [],
    active_required_documents: 0,
    draft_documents: 0,
    program_active: true,
    legal_update_required: false,
    ...overrides,
  };
}

function value(state, id) {
  return state.statuses.find((item) => item.id === id)?.value;
}

test("unveröffentlichte Dokumente können nie Veröffentlichung erledigt anzeigen", () => {
  const state = resolveOwnerLegalReadiness(registration());
  assert.equal(value(state, "publication"), "Offen");
  assert.equal(value(state, "registration"), "Blockiert");
  assert.equal(value(state, "program"), "Aktiv");
});

test("fehlende Unternehmensdaten bleiben der erste offene Schritt", () => {
  const state = resolveOwnerLegalReadiness(registration({ missing_profile_fields: ["Kontakt-E-Mail"] }));
  assert.equal(state.action.label, "Unternehmensdaten vervollständigen");
  assert.equal(value(state, "company"), "Offen");
});

test("vorbereitete Entwürfe verlangen Prüfung und bleiben vor Veröffentlichung blockiert", () => {
  const state = resolveOwnerLegalReadiness(registration({ draft_documents: 2 }), { hasDrafts: true });
  assert.equal(value(state, "documents"), "Prüfung erforderlich");
  assert.equal(value(state, "publication"), "Prüfung erforderlich");
  assert.equal(state.action.label, "Dokumente prüfen");
});

test("bestätigte Entwürfe bieten ausschließlich die Veröffentlichung als nächsten Schritt", () => {
  const state = resolveOwnerLegalReadiness(registration({ draft_documents: 2 }), {
    hasDrafts: true,
    publicationConfirmed: true,
  });
  assert.equal(value(state, "publication"), "Bereit zur Veröffentlichung");
  assert.equal(state.action.label, "Geprüfte Version veröffentlichen");
});

test("aktive Pflichtdokumente geben die Kundenregistrierung serverseitig frei", () => {
  const state = resolveOwnerLegalReadiness(registration({
    status: "green",
    registration_allowed: true,
    active_required_documents: 2,
  }));
  assert.equal(value(state, "documents"), "Erledigt");
  assert.equal(value(state, "publication"), "Erledigt");
  assert.equal(value(state, "registration"), "Freigegeben");
  assert.equal(state.action.label, "Dokumente ansehen");
});

test("Publikationsvalidierung benennt das konkrete fehlende Feld oder Dokument", () => {
  assert.equal(validateLegalPublication([], "", false), "Gültigkeitsdatum fehlt.");
  assert.equal(validateLegalPublication([], "2026-08-29", true), "Teilnahmebedingungen: vorbereitete Version fehlt.");
  assert.equal(legalPublicationErrorMessage({ code: "22004", message: "LEGAL_EFFECTIVE_DATE_REQUIRED" }), "Gültigkeitsdatum fehlt.");
  assert.equal(legalPublicationErrorMessage({ code: "P0001", message: "LEGAL_PUBLICATION_CONFIRMATION_REQUIRED" }), "Bitte bestätige beide Dokumente vor der Veröffentlichung.");
});

test("Owner-Seite nutzt einen zentralen Resolver und keine alte Veröffentlichungsableitung", () => {
  assert.match(ownerPage, /resolveOwnerLegalReadiness\(registration/);
  assert.doesNotMatch(ownerPage, /Veröffentlichung:\s*\{hasDrafts\s*\?\s*"Prüfung erforderlich"\s*:\s*"Erledigt"\}/);
  assert.match(ownerPage, /Kundenregistrierung/);
  assert.match(ownerPage, /Dokumente noch nicht veröffentlicht/);
  assert.doesNotMatch(ownerPage, /vorbereitete Dokumenthülle/);
  assert.doesNotMatch(ownerPage, /Bitte prüfe Vorschau und Gültigkeitsdatum/);
});

test("Willkommensgeschenke sind auf Mobilgeräten einspaltig und unverändert mehrfach auswählbar", () => {
  const mobile = styles.slice(styles.indexOf("@media (max-width: 699px)", styles.indexOf(".template-selection-card.selected:hover")));
  assert.match(mobile, /\.template-selection-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(mobile, /\.starter-reward-counter\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(onboarding, /toggleStarterRewardTemplate/);
  assert.match(onboarding, /selectedStarterRewardCount/);
});

test("Legal-Workflow bleibt mobil kompakt und ohne technische Primärtexte", () => {
  assert.match(ownerPage, /Dokumentdetails anzeigen/);
  assert.match(ownerPage, /Hinweis zu den Dokumentvorlagen/);
  assert.match(ownerStyles, /owner-legal-journey[\s\S]*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.match(ownerStyles, /owner-legal-checklist p strong[\s\S]*grid-column:\s*2/);
});
