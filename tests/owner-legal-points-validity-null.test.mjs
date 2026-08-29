import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getLegalDocumentContent,
  getPointsValidityState,
  ownerLegalLoadErrorMessage,
} from "../src/modules/legal/legalDocumentState.mjs";

const ownerPage = await readFile(new URL("../src/modules/legal/OwnerLegalSettingsPage.tsx", import.meta.url), "utf8");
const legalService = await readFile(new URL("../src/modules/legal/legalService.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const boundary = await readFile(new URL("../src/modules/legal/OwnerLegalErrorBoundary.tsx", import.meta.url), "utf8");

test("veröffentlichte Punktegültigkeit wird aus dem aktiven Dokumentinhalt gelesen", () => {
  assert.deepEqual(getPointsValidityState({ content: { points_validity_months: "18" } }), {
    status: "available",
    months: 18,
  });
});

test("fehlendes Teilnahmebedingungsdokument bleibt ein eigener Einrichtungszustand", () => {
  assert.deepEqual(getPointsValidityState(null), { status: "missing_document", months: null });
});

test("Dokumenthülle mit content null erzeugt keinen Null-Zugriff und keinen Default", () => {
  assert.equal(getLegalDocumentContent({ content: null }), null);
  assert.deepEqual(getPointsValidityState({ content: null }), {
    status: "missing_published_content",
    months: null,
  });
});

test("fehlender oder ungültiger Wert wird nicht als rechtliche Aussage erfunden", () => {
  assert.deepEqual(getPointsValidityState({ content: { points_validity_months: null } }), {
    status: "missing_value",
    months: null,
  });
  assert.doesNotMatch(ownerPage, /pointsValidity[^\n]*\?[^\n]*12/);
});

test("API- und Berechtigungsfehler werden ohne technische Details übersetzt", () => {
  assert.equal(
    ownerLegalLoadErrorMessage(new Error("network timeout")),
    "Die rechtlichen Einstellungen konnten nicht geladen werden. Bitte versuche es erneut.",
  );
  assert.equal(
    ownerLegalLoadErrorMessage({ code: "42501", message: "permission denied" }),
    "Du darfst die rechtlichen Einstellungen dieses Restaurants nicht öffnen.",
  );
});

test("Loader verwendet den geschützten RPC und akzeptiert kein leeres Payload", () => {
  assert.match(legalService, /client\.rpc\("get_restaurant_legal_setup"/);
  assert.match(legalService, /if \(!data \|\| typeof data !== "object" \|\| Array\.isArray\(data\)\)/);
  assert.doesNotMatch(legalService, /\.single\(\)|\.maybeSingle\(\)/);
});

test("Owner-Seite besitzt Loading, Empty State, Retry und Einrichtungs-CTA", () => {
  assert.match(ownerPage, /Dokumente werden geladen/);
  assert.match(ownerPage, /Bonusprogramm noch nicht vollständig eingerichtet/);
  assert.match(ownerPage, /Dokumente noch nicht veröffentlicht/);
  assert.match(ownerPage, /setRetryRevision/);
  assert.match(ownerPage, />Erneut versuchen</);
  assert.match(ownerPage, /to="\/admin\/onboarding">Zum Onboarding/);
});

test("Owner-Seite dereferenziert content nicht mehr direkt", () => {
  assert.doesNotMatch(ownerPage, /terms\?\.content\.|terms\.content\./);
  assert.match(ownerPage, /getPointsValidityState\(terms\)/);
  assert.match(ownerPage, /Noch nicht veröffentlicht/);
});

test("lokale Error Boundary hält die geschützte Legal-Route stabil", () => {
  assert.match(app, /<OwnerLegalErrorBoundary><OwnerLegalSettingsPage \/><\/OwnerLegalErrorBoundary>/);
  assert.match(boundary, /Diese Seite konnte nicht geladen werden/);
  assert.match(boundary, /Erneut versuchen/);
  assert.match(boundary, /Zum Dashboard/);
  assert.doesNotMatch(boundary, /stack|error\.message|info\./i);
});
