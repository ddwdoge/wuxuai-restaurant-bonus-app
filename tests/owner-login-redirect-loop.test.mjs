import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const authProvider = read("../src/modules/auth/AuthProvider.tsx");
const login = read("../src/modules/auth/LoginPage.tsx");
const protectedRoute = read("../src/modules/auth/ProtectedRoute.tsx");
const registration = read("../src/modules/auth/registerOwnerService.ts");

test("erfolgreicher Owner-Login übernimmt die Session vor der Navigation", () => {
  assert.match(authProvider, /signInWithPassword\(\{ email, password \}\)/);
  assert.match(authProvider, /setSession\(data\.session\)/);
  assert.match(authProvider, /setUser\(data\.user\)/);
  assert.match(authProvider, /setRoleLoading\(true\)/);
  assert.match(login, /await signIn\(email, password\)/);
  assert.match(login, /navigate\("\/admin"\)/);
});

test("Restaurantrollen stammen aus Memberships und niemals aus Client-Metadaten", () => {
  assert.match(authProvider, /from\("restaurant_members"\)/);
  assert.doesNotMatch(authProvider, /readAppMetadataRestaurantRole/);
  assert.doesNotMatch(authProvider, /app_metadata[^\n]*RestaurantRole/);
});

test("temporärer Rollenfehler behält die Sitzung und bietet Retry", () => {
  const errorStateStart = protectedRoute.indexOf('if (roleScope === "restaurant" && restaurantAuthorizationError)');
  const deniedStateStart = protectedRoute.indexOf("if (!activeRole", errorStateStart);
  const errorState = protectedRoute.slice(errorStateStart, deniedStateStart);

  assert.match(authProvider, /restaurantAuthorizationError/);
  assert.match(errorState, /Restaurantzugang konnte nicht geladen werden/);
  assert.match(errorState, /Deine Anmeldung bleibt bestehen/);
  assert.match(errorState, /onClick=\{retryAuthorization\}/);
  assert.doesNotMatch(errorState, /Navigate/);
});

test("fehlende Membership wird nicht als Auth-Fehler oder Ownerrolle behandelt", () => {
  assert.match(protectedRoute, /Kein Restaurantzugang eingerichtet/);
  assert.match(protectedRoute, /Für dieses Konto ist aktuell kein Restaurant hinterlegt/);
  assert.doesNotMatch(protectedRoute, /Navigate to="\/" replace/);
});

test("Pending Owner Registration bleibt idempotent und ohne Pending-Daten ein No-op", () => {
  assert.match(registration, /if \(!pendingRegistration\) \{\s*return false;/);
  assert.match(registration, /startOwnerTrial\(pendingRegistration, 3\)/);
  assert.match(registration, /localStorage\.removeItem\(pendingRegistrationKey\)/);
});
